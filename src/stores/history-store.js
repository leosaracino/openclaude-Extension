const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_FILE_BYTES
} = require('../constants');
const {
  createId,
  nowIso,
  truncate,
  readJsonLine,
  extractTextFromContent,
  extractMessageText,
  computeToolSummary,
  computeFilesChangedSummaryForRange,
  normalizeHistoryRecord
} = require('../utils');
const { OpenClaudePaths } = require('../services/openclaude-paths');

class HistoryStore {
  constructor(options = {}) {
    this.home = options.home || process.env.USERPROFILE || os.homedir();
    this.paths = options.paths || new OpenClaudePaths({ home: this.home });
    this.paths.ensureUserState();
    this.codexHome = path.join(this.home, '.codex');
  }

  getProjectRoots() {
    const openClaudeProjects = this.paths.projectsDir;
    const claudeProjects = this.paths.legacyProjectsDir;
    return [openClaudeProjects, claudeProjects].filter((folder) => fs.existsSync(folder));
  }

  async listRecentSessions() {
    const files = [];

    for (const root of this.getProjectRoots()) {
      this.collectJsonlFiles(root, files);
    }

    const recordsById = new Map();

    for (const filePath of files) {
      try {
        const stats = fs.statSync(filePath);
        const preview = this.readSessionPreview(filePath, stats);
        const record = normalizeHistoryRecord(preview, filePath, stats);
        if (!recordsById.has(record.id)) {
          recordsById.set(record.id, record);
        }
      } catch {
        // Ignore individual history files that are being written or are malformed.
      }
    }

    try {
      const codexRecords = this.listCodexSessions();
      for (const record of codexRecords) {
        recordsById.set(`codex:${record.id}`, record);
      }
    } catch {
      // Best-effort - never let Codex parsing block OpenClaude history.
    }

    return Array.from(recordsById.values())
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, MAX_HISTORY_ITEMS);
  }

  listCodexSessions() {
    const indexPath = path.join(this.codexHome, 'session_index.jsonl');
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const records = [];
    let raw;
    try {
      raw = fs.readFileSync(indexPath, 'utf8');
    } catch {
      return [];
    }

    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const parsed = readJsonLine(line);
      if (!parsed?.id) continue;

      const filePath = this.findCodexSessionFile(parsed.id, parsed.updated_at);
      if (!filePath) continue;

      const updatedAt = parsed.updated_at || new Date().toISOString();
      const title = truncate(parsed.thread_name || `Codex ${parsed.id.slice(0, 8)}`);

      records.push({
        id: parsed.id,
        source: 'codex',
        filePath,
        projectLabel: 'Codex',
        title,
        preview: title,
        updatedAt,
        timestamp: updatedAt
      });
    }

    return records;
  }

  findCodexSessionFile(id, updatedAtIso) {
    const sessionsRoot = path.join(this.codexHome, 'sessions');
    if (!fs.existsSync(sessionsRoot)) return undefined;

    if (updatedAtIso) {
      const match = String(updatedAtIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, year, month, day] = match;
        const dayDir = path.join(sessionsRoot, year, month, day);
        const candidate = this.findRolloutInDir(dayDir, id);
        if (candidate) return candidate;
      }
    }

    return this.walkCodexSessionsForId(sessionsRoot, id);
  }

  findRolloutInDir(dirPath, id) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      return undefined;
    }
    const suffix = `-${id}.jsonl`;
    const match = entries.find((name) => name.endsWith(suffix));
    return match ? path.join(dirPath, match) : undefined;
  }

  walkCodexSessionsForId(root, id) {
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(next);
        } else if (entry.isFile() && entry.name.endsWith(`-${id}.jsonl`)) {
          return next;
        }
      }
    }
    return undefined;
  }

  loadCodexMessages(sessionId, knownPath) {
    const filePath = knownPath || this.findCodexSessionFile(sessionId);
    if (!filePath || !fs.existsSync(filePath)) {
      return [];
    }

    const stats = fs.statSync(filePath);
    if (stats.size > MAX_HISTORY_FILE_BYTES) {
      return [{
        id: createId('history'),
        role: 'system',
        text: 'Sessão Codex muito grande para preview.',
        final: true
      }];
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const messages = [];

    for (const line of lines) {
      const parsed = readJsonLine(line);
      if (!parsed) continue;
      if (parsed.type !== 'response_item') continue;

      const payload = parsed.payload;
      if (!payload || payload.type !== 'message') continue;

      const role = payload.role;
      if (role !== 'user' && role !== 'assistant') continue;

      const textParts = Array.isArray(payload.content)
        ? payload.content
            .map((item) => {
              if (!item || typeof item !== 'object') return '';
              if (item.type === 'input_text' || item.type === 'output_text' || item.type === 'text') {
                return item.text || '';
              }
              return '';
            })
            .filter(Boolean)
        : [];

      const text = textParts.join('\n').trim();
      if (!text) continue;

      if (/^<environment_context>/i.test(text)) continue;
      if (/^<permissions instructions>/i.test(text)) continue;
      if (/^<user_instructions>/i.test(text)) continue;

      messages.push({
        id: createId(role === 'user' ? 'codex-user' : 'codex-assistant'),
        role,
        text,
        final: true
      });
    }

    return messages.slice(-200);
  }

  collectJsonlFiles(folder, files) {
    let entries;

    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const nextPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        this.collectJsonlFiles(nextPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(nextPath);
      }
    }
  }

  readSessionPreview(filePath, stats) {
    const maxBytes = Math.min(stats.size, 256 * 1024);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);

    try {
      fs.readSync(fd, buffer, 0, maxBytes, 0);
    } finally {
      fs.closeSync(fd);
    }

    const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
    let preview = '';
    let timestamp = stats.mtime.toISOString();
    let title = '';

    for (const line of lines) {
      const parsed = readJsonLine(line);
      if (!parsed) {
        continue;
      }

      timestamp = parsed.timestamp || timestamp;
      const type = parsed.type || parsed.message?.role;
      const text = extractMessageText(parsed);

      if (!title && parsed.summary) {
        title = parsed.summary;
      }

      if (!preview && type === 'user' && text) {
        preview = text;
      }

      if (!preview && text) {
        preview = text;
      }
    }

    return { title, preview, timestamp };
  }

  findSessionFile(sessionId) {
    return this.findSessionFiles(sessionId)[0];
  }

  findSessionFiles(sessionId) {
    const matches = [];
    for (const root of this.getProjectRoots()) {
      const files = [];
      this.collectJsonlFiles(root, files);
      matches.push(...files.filter((filePath) => path.basename(filePath, '.jsonl') === sessionId));
    }

    return matches;
  }

  deleteSession(sessionId) {
    if (this.isCodexSessionId(sessionId)) {
      throw new Error('Sessões Codex não podem ser apagadas por aqui — use o próprio Codex CLI.');
    }

    const filePaths = this.findSessionFiles(sessionId);
    if (!filePaths.length) {
      throw new Error('Arquivo de historico nao encontrado.');
    }

    const trashRoot = this.paths.deletedHistoryDir;
    fs.mkdirSync(trashRoot, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targets = filePaths.map((filePath, index) => {
      const prefix = index === 0 ? '' : `${index + 1}-`;
      const targetPath = path.join(trashRoot, `${stamp}-${prefix}${path.basename(filePath)}`);
      fs.renameSync(filePath, targetPath);
      return targetPath;
    });
    return targets[0];
  }

  isCodexSessionId(sessionId) {
    const indexPath = path.join(this.codexHome, 'session_index.jsonl');
    if (!fs.existsSync(indexPath)) return false;
    try {
      const raw = fs.readFileSync(indexPath, 'utf8');
      return raw.includes(`"id":"${sessionId}"`);
    } catch {
      return false;
    }
  }

  loadMessages(sessionId) {
    const filePath = this.findSessionFile(sessionId);
    if (!filePath) {
      return [];
    }

    const stats = fs.statSync(filePath);
    if (stats.size > MAX_HISTORY_FILE_BYTES) {
      return [{
        id: createId('history'),
        role: 'system',
        text: 'Historico muito grande para preview. A sessao ainda sera retomada pelo OpenClaude.',
        final: true
      }];
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    const messages = [];
    const toolCardsById = new Map();

    for (const line of lines) {
      const parsed = readJsonLine(line);
      if (!parsed) continue;

      const messageType = parsed.type;
      const innerMessage = parsed.message;

      if (messageType === 'user' || (messageType === undefined && innerMessage?.role === 'user')) {
        const content = innerMessage?.content;

        if (typeof content === 'string') {
          const text = content.trim();
          if (text) {
            messages.push({ id: createId('history-user'), role: 'user', text, final: true });
          }
          continue;
        }

        if (Array.isArray(content)) {
          let plainText = '';
          for (const block of content) {
            if (!block || typeof block !== 'object') continue;

            if (block.type === 'tool_result') {
              const card = toolCardsById.get(block.tool_use_id);
              const resultText = extractTextFromContent(block.content) || '';
              if (card) {
                card.toolResult = resultText;
                card.toolStatus = block.is_error ? 'error' : 'success';
                card.final = true;
                card.toolSummary = computeToolSummary(card);
                card.text = card.toolSummary;
              }
              continue;
            }

            if (block.type === 'text' && block.text) {
              plainText += (plainText ? '\n' : '') + block.text;
            }
          }
          if (plainText.trim()) {
            messages.push({ id: createId('history-user'), role: 'user', text: plainText.trim(), final: true });
          }
          continue;
        }

        const text = extractMessageText(parsed);
        if (text) {
          messages.push({ id: createId('history-user'), role: 'user', text, final: true });
        }
        continue;
      }

      if (messageType === 'assistant' || innerMessage?.role === 'assistant') {
        const content = innerMessage?.content;
        if (!Array.isArray(content)) {
          const text = extractMessageText(parsed);
          if (text) {
            messages.push({ id: createId('history-assistant'), role: 'assistant', text, final: true });
          }
          continue;
        }

        let pendingText = '';
        const flushText = () => {
          const t = pendingText.trim();
          if (t) {
            messages.push({ id: createId('history-assistant'), role: 'assistant', text: t, final: true });
          }
          pendingText = '';
        };

        for (const block of content) {
          if (!block || typeof block !== 'object') continue;

          if (block.type === 'text' && block.text) {
            pendingText += (pendingText ? '\n' : '') + block.text;
            continue;
          }

          if (block.type === 'tool_use') {
            flushText();
            const card = {
              id: createId('history-tool'),
              role: 'tool',
              text: '',
              title: block.name || 'Ferramenta',
              final: false,
              createdAt: parsed.timestamp || nowIso(),
              toolUseId: block.id,
              toolName: block.name || 'tool',
              toolInput: block.input || {},
              toolStatus: 'success',
              toolResult: null
            };
            card.toolSummary = computeToolSummary(card);
            card.text = card.toolSummary;
            messages.push(card);
            if (block.id) toolCardsById.set(block.id, card);
            continue;
          }

          if (block.type === 'thinking' && block.thinking) {
            flushText();
            messages.push({
              id: createId('history-thinking'),
              role: 'thinking',
              text: block.thinking,
              title: 'Pensamento',
              final: true,
              createdAt: parsed.timestamp || nowIso()
            });
            continue;
          }
        }
        flushText();
        continue;
      }
    }

    const withSummaries = [];
    let turnStart = 0;
    for (let i = 0; i < messages.length; i += 1) {
      withSummaries.push(messages[i]);
      const isLast = i === messages.length - 1;
      const nextIsUser = !isLast && messages[i + 1].role === 'user';
      if (isLast || nextIsUser) {
        const summary = computeFilesChangedSummaryForRange(messages, turnStart, i + 1);
        if (summary) withSummaries.push(summary);
        turnStart = i + 1;
      }
    }

    return withSummaries.slice(-200);
  }
}

module.exports = {
  HistoryStore
};

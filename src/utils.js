const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');

const {
  MAX_MESSAGE_PREVIEW,
  PROVIDER_KEYS
} = require('./constants');

// Normalize legacy session mode values (pre-collapse) into the new
// single/swarm space. Persisted sessions and old serialized state may still
// carry 'default' / 'plan' / 'ruflo'.
function normalizeSessionMode(mode) {
  if (mode === 'swarm' || mode === 'ruflo') return 'swarm';
  // 'default', 'plan', undefined, anything else -> single.
  return 'single';
}

function getWorkspaceCwd() {
  const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return firstFolder || process.env.USERPROFILE || process.cwd();
}

function createId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).find(Boolean) || '';
}

function truncate(value, limit = MAX_MESSAGE_PREVIEW) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

// Convert the OpenClaude terminal banner (full-block + double-line box-drawing
// characters) into inline SVG rectangles. We do this because relying on a
// monospace system font to render `█ ╗ ╔ ║ ═ ╝ ╚` at consistent widths is
// not reliable across machines - the glyphs end up from different fallback
// fonts with different metrics and the logo ends up visibly distorted. SVG
// gives us pixel-perfect, font-independent rendering at any size.
//
// Each character becomes a cell of size CELL_W x CELL_H. Within a cell we
// emit appropriate <rect> elements, positioned so chains of `═` `║` corners
// join into continuous double lines across cells.
function asciiArtToSvg(ascii, options = {}) {
  // Cell + stroke proportions chosen so when the SVG is scaled down to fit
  // the side panel (~280-480 px wide) the strokes still render at >=1 css
  // pixel, avoiding the "fading" look caused by sub-pixel widths.
  const cellW = options.cellW || 10;
  const cellH = options.cellH || 18;
  const stroke = options.stroke || 2;
  // Double-line offsets within a cell (symmetric around the center).
  const hTop = options.hTop !== undefined ? options.hTop : 6;
  const hBot = options.hBot !== undefined ? options.hBot : 10;
  const vLeft = options.vLeft !== undefined ? options.vLeft : 2;
  const vRight = options.vRight !== undefined ? options.vRight : 6;

  const lines = String(ascii).split('\n');
  const cols = lines.reduce((max, line) => Math.max(max, Array.from(line).length), 0);
  const totalW = cols * cellW;
  const totalH = lines.length * cellH;

  const rects = [];
  const pushRect = (x, y, w, h) => {
    if (w <= 0 || h <= 0) return;
    rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  };

  for (let r = 0; r < lines.length; r += 1) {
    const chars = Array.from(lines[r]);
    for (let c = 0; c < chars.length; c += 1) {
      const ch = chars[c];
      if (ch === ' ' || ch === '\t' || ch === '') continue;

      const ox = c * cellW;
      const oy = r * cellH;

      switch (ch) {
        case '█':
          pushRect(ox, oy, cellW, cellH);
          break;

        case '═':
          pushRect(ox, oy + hTop, cellW, stroke);
          pushRect(ox, oy + hBot, cellW, stroke);
          break;

        case '║':
          pushRect(ox + vLeft, oy, stroke, cellH);
          pushRect(ox + vRight, oy, stroke, cellH);
          break;

        case '╔':
          pushRect(ox + vLeft, oy + hTop, cellW - vLeft, stroke);
          pushRect(ox + vLeft, oy + hTop, stroke, cellH - hTop);
          pushRect(ox + vRight, oy + hBot, cellW - vRight, stroke);
          pushRect(ox + vRight, oy + hBot, stroke, cellH - hBot);
          break;

        case '╗':
          pushRect(ox, oy + hTop, vRight + stroke, stroke);
          pushRect(ox + vRight, oy + hTop, stroke, cellH - hTop);
          pushRect(ox, oy + hBot, vLeft + stroke, stroke);
          pushRect(ox + vLeft, oy + hBot, stroke, cellH - hBot);
          break;

        case '╚':
          pushRect(ox + vLeft, oy + hBot, cellW - vLeft, stroke);
          pushRect(ox + vLeft, oy, stroke, hBot + stroke);
          pushRect(ox + vRight, oy + hTop, cellW - vRight, stroke);
          pushRect(ox + vRight, oy, stroke, hTop + stroke);
          break;

        case '╝':
          pushRect(ox, oy + hBot, vRight + stroke, stroke);
          pushRect(ox + vRight, oy, stroke, hBot + stroke);
          pushRect(ox, oy + hTop, vLeft + stroke, stroke);
          pushRect(ox + vLeft, oy, stroke, hTop + stroke);
          break;

        default:
          break;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="OpenClaude" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="ocSunset" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgb(255,180,100)"/>
      <stop offset="20%" stop-color="rgb(240,148,100)"/>
      <stop offset="45%" stop-color="rgb(217,119,87)"/>
      <stop offset="65%" stop-color="rgb(193,95,60)"/>
      <stop offset="85%" stop-color="rgb(160,75,55)"/>
      <stop offset="100%" stop-color="rgb(130,60,50)"/>
    </linearGradient>
  </defs>
  <g fill="url(#ocSunset)">${rects.join('')}</g>
</svg>`;
}

// Build a "files changed" summary message from a slice of session messages
// (e.g. one assistant turn). Returns the message object or null if no
// file-touching tool calls succeeded in that range. Shared by both the
// live stream handler and the loadMessages history reconstruction so
// reloaded chats also get the GitHub-style "+N -N" review card per turn.
function computeFilesChangedSummaryForRange(messages, fromIndex, toIndex) {
  const fileMap = new Map();
  const linesOf = (s) => String(s || '').split('\n').length;

  for (let i = fromIndex; i < toIndex; i += 1) {
    const message = messages[i];
    if (!message || message.role !== 'tool') continue;
    if (message.toolStatus !== 'success') continue;

    const input = message.toolInput || {};
    const filePath = input.file_path || input.notebook_path;
    if (!filePath) continue;

    let added = 0;
    let removed = 0;
    const kind = message.toolName;

    if (kind === 'Write') {
      added = linesOf(input.content);
      removed = 0;
    } else if (kind === 'Edit') {
      added = linesOf(input.new_string);
      removed = linesOf(input.old_string);
    } else if (kind === 'MultiEdit') {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      for (const edit of edits) {
        added += linesOf(edit?.new_string);
        removed += linesOf(edit?.old_string);
      }
    } else if (kind === 'NotebookEdit') {
      added = linesOf(input.new_source);
      removed = linesOf(input.old_source);
    } else {
      continue;
    }

    const existing = fileMap.get(filePath);
    if (existing) {
      existing.added += added;
      existing.removed += removed;
      existing.kinds.add(kind);
    } else {
      fileMap.set(filePath, { filePath, added, removed, kinds: new Set([kind]) });
    }
  }

  if (fileMap.size === 0) return null;

  const files = Array.from(fileMap.values()).map((entry) => ({
    filePath: entry.filePath,
    added: entry.added,
    removed: entry.removed,
    kind: entry.kinds.has('Write') && entry.kinds.size === 1 ? 'created' : 'modified'
  }));

  return {
    id: createId('files-changed'),
    role: 'files-changed',
    text: '',
    final: true,
    createdAt: nowIso(),
    files
  };
}

function computeToolSummary(card) {
  const input = card.toolInput || {};
  const baseName = (p) => {
    const str = String(p || '');
    const idx = Math.max(str.lastIndexOf('/'), str.lastIndexOf('\\'));
    return idx >= 0 ? str.slice(idx + 1) : str;
  };
  const lines = (s) => String(s || '').split('\n').length;

  switch (card.toolName) {
    case 'Write':
      return `Escreveu ${baseName(input.file_path)} (${lines(input.content)} linhas)`;
    case 'Edit':
      return `Editou ${baseName(input.file_path)} (+${lines(input.new_string)} -${lines(input.old_string)})`;
    case 'NotebookEdit':
      return `Editou notebook ${baseName(input.notebook_path)}`;
    case 'Read':
      return `Leu ${baseName(input.file_path)}`;
    case 'Bash':
    case 'BashOutput': {
      const cmd = String(input.command || '').split('\n')[0];
      return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd;
    }
    case 'Glob':
      return `Glob: ${input.pattern || ''}`;
    case 'Grep':
      return `Grep: ${input.pattern || ''}`;
    case 'WebFetch':
      return `WebFetch: ${input.url || ''}`;
    case 'WebSearch':
      return `WebSearch: ${input.query || ''}`;
    case 'TodoWrite':
      return `Atualizou TODOs (${(input.todos || []).length})`;
    case 'Task':
      return `Lançou agent: ${input.subagent_type || 'general'}`;
    default:
      return `${card.toolName || 'Ferramenta'} executado`;
  }
}

function deriveChatTitle(text, fallback = 'Novo chat') {
  const firstLine = String(text || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  const cleaned = firstLine.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return fallback;
  }

  const limit = 36;
  if (cleaned.length <= limit) {
    return cleaned;
  }

  const slice = cleaned.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  const cutoff = lastSpace >= 18 ? lastSpace : limit;
  return `${cleaned.slice(0, cutoff).trimEnd()}…`;
}

function valueToDisplayText(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function describeSdkPayload(payload) {
  const parts = [];
  const add = (value) => {
    const text = valueToDisplayText(value).trim();
    if (text && !parts.includes(text)) {
      parts.push(text);
    }
  };

  add(extractMessageText(payload));
  add(payload?.error?.message);
  add(payload?.error);
  add(payload?.reason);
  add(payload?.status);
  add(payload?.detail);

  const retryDelay = payload?.retry_after_ms ?? payload?.retryAfterMs ?? payload?.delay_ms ?? payload?.delayMs;
  if (retryDelay !== undefined && retryDelay !== null) {
    const seconds = Number(retryDelay) >= 1000 ? Math.round(Number(retryDelay) / 1000) : retryDelay;
    add(`Nova tentativa em ${seconds}s.`);
  }

  if (payload?.attempt !== undefined || payload?.retry_count !== undefined) {
    add(`Tentativa: ${payload.attempt ?? payload.retry_count}.`);
  }

  if (!parts.length) {
    add(payload);
  }

  const text = parts.join('\n\n');
  return text.length > 3500 ? `${text.slice(0, 3500)}\n...` : text;
}

function quoteCmdArg(value) {
  const raw = String(value);
  if (!/[ \t"&|<>^]/.test(raw)) {
    return raw;
  }

  return `"${raw.replace(/"/g, '\\"')}"`;
}

function isLocalBaseUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl || '');
    return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function cleanProviderEnv(baseEnv) {
  const env = { ...baseEnv };

  for (const key of PROVIDER_KEYS) {
    delete env[key];
  }

  env.TERM = env.TERM || 'xterm-256color';
  env.COLORTERM = env.COLORTERM || 'truecolor';
  env.FORCE_COLOR = env.FORCE_COLOR || '1';
  return env;
}

function getSecretId(profileId) {
  return `leonardo.openclaude.apiKey.${profileId}`;
}

function getDefaultProfiles() {
  const stamp = nowIso();
  return [
    {
      id: 'profile-ollama-local',
      name: 'Ollama local',
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      baseUrl: 'http://localhost:11434/v1',
      createdAt: stamp,
      updatedAt: stamp
    },
    {
      id: 'profile-openai',
      name: 'OpenAI',
      provider: 'openai-compatible',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      apiKeySecretId: getSecretId('profile-openai'),
      createdAt: stamp,
      updatedAt: stamp
    },
    {
      id: 'profile-gemini',
      name: 'Google Gemini',
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKeySecretId: getSecretId('profile-gemini'),
      createdAt: stamp,
      updatedAt: stamp
    }
  ];
}

function profileNeedsApiKey(profile) {
  if (!profile) {
    return false;
  }

  if (profile.provider === 'openai-compatible') {
    return !isLocalBaseUrl(profile.baseUrl || 'https://api.openai.com/v1');
  }

  return profile.provider === 'gemini' || profile.provider === 'mistral';
}

function profileLabel(profile) {
  if (!profile) {
    return 'Nenhum modelo';
  }

  return `${profile.name} (${profile.model || 'sem modelo'})`;
}

function readJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function extractTextFromContent(content) {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item?.type === 'text' || item?.type === 'input_text' || item?.type === 'output_text') {
        return item.text || '';
      }

      if (item?.type === 'tool_use') {
        return '';
      }

      if (item?.type === 'tool_result') {
        return extractTextFromContent(item.content) || '';
      }

      return '';
    }).filter(Boolean).join('\n');
  }

  if (typeof content === 'object') {
    return content.text || content.value || content.result || '';
  }

  return '';
}

function extractMessageText(message) {
  if (!message) {
    return '';
  }

  if (typeof message === 'string') {
    return message;
  }

  if (message.message) {
    return extractMessageText(message.message);
  }

  if (message.content) {
    return extractTextFromContent(message.content);
  }

  if (message.result) {
    return extractMessageText(message.result);
  }

  return message.text || message.summary || message.error || '';
}

function extractToolUses(content) {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter((item) => item?.type === 'tool_use').map((item) => ({
    id: item.id || createId('tool'),
    name: item.name || 'tool',
    input: item.input
  }));
}

function normalizeHistoryRecord(raw, filePath, stats) {
  const sessionId = path.basename(filePath, '.jsonl');
  const projectLabel = path.basename(path.dirname(filePath)).replace(/-/g, ' ');
  const timestamp = raw.timestamp || raw.createdAt || stats.mtime.toISOString();
  const text = truncate(raw.preview || raw.title || 'Sessao OpenClaude');

  return {
    id: sessionId,
    source: 'openclaude',
    filePath,
    projectLabel,
    title: text || sessionId,
    preview: text,
    updatedAt: stats.mtime.toISOString(),
    timestamp
  };
}

module.exports = {
  normalizeSessionMode,
  getWorkspaceCwd,
  createId,
  nowIso,
  trimString,
  firstLine,
  truncate,
  asciiArtToSvg,
  computeFilesChangedSummaryForRange,
  computeToolSummary,
  deriveChatTitle,
  describeSdkPayload,
  quoteCmdArg,
  isLocalBaseUrl,
  cleanProviderEnv,
  getSecretId,
  getDefaultProfiles,
  profileNeedsApiKey,
  profileLabel,
  readJsonLine,
  extractTextFromContent,
  extractMessageText,
  extractToolUses,
  normalizeHistoryRecord
};

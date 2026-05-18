const vscode = require('vscode');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const path = require('path');

const {
  OPENCLAUDE_CMD,
  PERMISSION_MODES,
  DEFAULT_PERMISSION_MODE,
  THINKING_TOKEN_BUDGET,
  SESSION_MODES,
  DEFAULT_SESSION_MODE,
  RUFLO_PROMPT_PREFIX
} = require('./constants');
const {
  normalizeSessionMode,
  getWorkspaceCwd,
  createId,
  nowIso,
  trimString,
  computeFilesChangedSummaryForRange,
  computeToolSummary,
  deriveChatTitle,
  describeSdkPayload,
  quoteCmdArg,
  isLocalBaseUrl,
  cleanProviderEnv,
  profileNeedsApiKey,
  readJsonLine,
  extractTextFromContent,
  extractMessageText,
  extractToolUses
} = require('./utils');
const {
  manageProfiles,
  manageSkillsAndAgents,
  configureProfileApiKey
} = require('./commands');
const { getOpenClaudeHtml } = require('./webview-html');
const { RufloService } = require('./services/ruflo-service');
const { OpenClaudePaths } = require('./services/openclaude-paths');
const { resolveModelCapabilities } = require('./services/model-capabilities');
const {
  selectRufloTools,
  buildRufloDenyRules
} = require('./services/ruflo-tool-policy');

const execAsync = util.promisify(exec);

class OpenClaudeViewProvider {
  constructor(
    context,
    profileStore,
    historyStore,
    skillsStore,
    rufloService = new RufloService(),
    openClaudePaths = skillsStore?.paths || historyStore?.paths || rufloService?.paths || new OpenClaudePaths()
  ) {
    this.context = context;
    this.profileStore = profileStore;
    this.historyStore = historyStore;
    this.skillsStore = skillsStore;
    this.rufloService = rufloService;
    this.openClaudePaths = openClaudePaths;
    this.openClaudePaths.ensureUserState();
    this.view = undefined;
    this.webviewReady = false;
    this.pendingNewChat = false;
    this.activeSessionId = undefined;
    this.sessionCounter = 0;
    this.sessions = new Map();
    this.stdoutBuffers = new Map();
    this.stderrBuffers = new Map();
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    this.webviewReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = getOpenClaudeHtml(webviewView.webview, this.context.extensionUri);

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.webviewReady = false;
    });
  }

  async handleWebviewMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.command === 'ready') {
      this.webviewReady = true;
      await this.sendHydrate();

      if (this.pendingNewChat) {
        this.pendingNewChat = false;
        await this.createSession();
      }
      return;
    }

    if (message.command === 'newChat') {
      await this.createSession();
      return;
    }

    if (message.command === 'newChatWithMessage') {
      const sessionId = await this.createSession();
      if (sessionId) {
        await this.sendUserMessage(sessionId, message.text);
      }
      return;
    }

    if (message.command === 'sendMessage') {
      await this.sendUserMessage(message.sessionId || this.activeSessionId, message.text);
      return;
    }

    if (message.command === 'stopChat') {
      this.stopSession(message.sessionId || this.activeSessionId);
      return;
    }

    if (message.command === 'closeChat') {
      this.closeSession(message.sessionId || this.activeSessionId);
      return;
    }

    if (message.command === 'switchChat') {
      this.setActiveSession(message.sessionId);
      return;
    }

    if (message.command === 'selectProfile') {
      await this.profileStore.setActiveProfileId(message.profileId);
      await this.sendHydrate();
      return;
    }

    if (message.command === 'manageProfiles') {
      await manageProfiles(this.profileStore);
      await this.sendHydrate();
      return;
    }

    if (message.command === 'configureApiKey') {
      const profile = await this.profileStore.getActiveProfile();
      if (profile) {
        await configureProfileApiKey(this.profileStore, profile);
        await this.sendHydrate();
      }
      return;
    }

    if (message.command === 'manageSkills') {
      await manageSkillsAndAgents(this.skillsStore);
      return;
    }

    if (message.command === 'resumeSession') {
      // Codex threads can't be resumed in OpenClaude (different format).
      // Route them into viewer mode automatically.
      if (message.source === 'codex') {
        await this.openViewerSession(message.sessionId, 'codex');
        return;
      }
      await this.createSession({ resumeSessionId: message.sessionId });
      return;
    }

    if (message.command === 'viewHistorySession') {
      await this.openViewerSession(message.sessionId, message.source || 'codex');
      return;
    }

    if (message.command === 'promoteViewerToChat') {
      await this.promoteViewerToChat(message.sessionId || this.activeSessionId);
      return;
    }

    if (message.command === 'refreshHistory') {
      await this.sendHydrate();
      return;
    }

    if (message.command === 'deleteHistorySession') {
      await this.deleteHistorySession(message.sessionId, message.title);
      return;
    }

    if (message.command === 'permissionResponse') {
      this.sendPermissionResponse(
        message.sessionId,
        message.requestId,
        message.decision,
        {
          toolInput: message.toolInput,
          suggestion: message.suggestion
        }
      );
      return;
    }

    if (message.command === 'setPermissionMode') {
      this.setSessionPermissionMode(message.sessionId || this.activeSessionId, message.mode);
      return;
    }

    if (message.command === 'setThinking') {
      this.setSessionThinking(message.sessionId || this.activeSessionId, Boolean(message.enabled));
      return;
    }

    if (message.command === 'setMode') {
      await this.setSessionMode(message.sessionId || this.activeSessionId, message.mode);
      return;
    }

    if (message.command === 'addSkill') {
      this.addSkillToSession(message.sessionId || this.activeSessionId, message.skillId);
      return;
    }

    if (message.command === 'removeSkill') {
      this.removeSkillFromSession(message.sessionId || this.activeSessionId, message.skillId);
      return;
    }

    if (message.command === 'getAvailableSkills') {
      const skills = this.skillsStore.listLibrarySkills();
      this.postMessage({ type: 'availableSkills', skills });
      return;
    }

    if (message.command === 'getRufloStatus') {
      const status = await this.checkRufloEnvironment({ force: Boolean(message.force) });
      this.postMessage({ type: 'rufloStatus', status });
      return;
    }

    if (message.command === 'runRufloAction') {
      await this.runRufloAction(message.action);
      return;
    }

    if (message.command === 'openRufloCli') {
      await this.openRufloCli();
      return;
    }
  }

  async show() {
    await vscode.commands.executeCommand('workbench.view.extension.leonardo-openclaude');
  }

  async showAndCreateSession() {
    this.pendingNewChat = true;
    await this.show();

    if (this.view && this.webviewReady) {
      this.pendingNewChat = false;
      await this.createSession();
    }
  }

  async resumeSessionFromPicker() {
    const history = await this.historyStore.listRecentSessions();
    if (history.length === 0) {
      vscode.window.showInformationMessage('Nao encontrei historico nativo do OpenClaude nessa maquina.');
      return;
    }

    const picked = await vscode.window.showQuickPick(history.map((item) => ({
      label: item.title || item.id,
      description: item.projectLabel,
      detail: `${new Date(item.updatedAt).toLocaleString()} - ${item.id}`,
      item
    })), {
      placeHolder: 'Escolha uma sessao OpenClaude para retomar'
    });

    if (!picked) {
      return;
    }

    await this.show();
      await this.createSession({ resumeSessionId: picked.item.id });
  }

  // Open a session in read-only viewer mode (no openclaude process spawned).
  // Used for Codex threads — we can show their messages but not continue
  // the exact thread because of provider/format differences.
  async openViewerSession(sessionId, source = 'codex') {
    if (!sessionId) return undefined;

    let messages = [];
    let title = `Codex ${this.shortSessionId(sessionId)}`;

    if (source === 'codex') {
      messages = this.historyStore.loadCodexMessages(sessionId);
      // Try to recover the thread name from the index for a friendlier title.
      const codexRecords = this.historyStore.listCodexSessions();
      const record = codexRecords.find((r) => r.id === sessionId);
      if (record) {
        title = record.title;
      }
    } else {
      messages = this.historyStore.loadMessages(sessionId);
    }

    const id = createId('viewer');
    const session = {
      id,
      openClaudeSessionId: undefined,
      title,
      cwd: getWorkspaceCwd(),
      profileId: undefined,
      profileName: source === 'codex' ? 'Codex (somente leitura)' : 'Histórico',
      model: undefined,
      messages,
      status: 'Modo leitura — não é possível continuar este chat aqui',
      streaming: false,
      closed: true,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      process: undefined,
      currentAssistantId: undefined,
      currentThinkingId: undefined,
      pendingPermissions: [],
      pendingControlRequests: new Map(),
      recentRetryKeys: new Map(),
      permissionMode: DEFAULT_PERMISSION_MODE,
      thinkingEnabled: false,
      mode: DEFAULT_SESSION_MODE,
      activeSkills: [],
      viewer: true,
      viewerSource: source,
      viewerSessionId: sessionId
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.postMessage({
      type: 'sessionCreated',
      session: this.serializeSession(session),
      activeSessionId: this.activeSessionId
    });

    return id;
  }

  // Take the current viewer session's messages and push them as context
  // into a fresh OpenClaude session, so the user can continue the
  // conversation with their active OpenClaude provider/model.
  async promoteViewerToChat(viewerSessionId) {
    const viewer = this.sessions.get(viewerSessionId);
    if (!viewer || !viewer.viewer) {
      return;
    }

    // Build a single context-injection user message summarizing the
    // historic thread. We send this as the first user turn so the model
    // sees the full prior context. Cap at a reasonable size.
    const transcript = viewer.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        const tag = m.role === 'user' ? 'Usuário' : 'Assistente';
        return `## ${tag}\n${m.text}`;
      })
      .join('\n\n');

    const cap = 16000;
    const trimmed = transcript.length > cap
      ? transcript.slice(transcript.length - cap)
      : transcript;

    const sourceLabel = viewer.viewerSource === 'codex' ? 'Codex CLI' : 'histórico';
    const preamble = `Contexto importado da thread "${viewer.title}" do ${sourceLabel}. Releia e responda como se a conversa abaixo tivesse acontecido com você. Continue de onde parou quando eu mandar a próxima mensagem.\n\n---\n\n${trimmed}\n\n---\n\nFim do contexto importado. Aguarde minha próxima instrução.`;

    // Close the viewer first to avoid two stacked sessions.
    this.closeSession(viewerSessionId);

    const newId = await this.createSession({});
    if (!newId) return;

    // The session is now spawning openclaude. Wait a tick for stdin to be
    // ready, then send the preamble as the first user message. createSession
    // already sets sessions.get(newId).process — sendUserMessage handles the
    // not-yet-ready case by appending an error if process is missing, but
    // by this point it should be up.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.sendUserMessage(newId, preamble);
  }

  async createSession(options = {}) {
    const profile = await this.profileStore.getActiveProfile();
    if (!profile) {
      this.showError('Crie ou selecione um perfil de modelo antes de iniciar o chat.');
      return undefined;
    }

    let apiKey = await this.profileStore.getSecret(profile);
    if (profileNeedsApiKey(profile) && !apiKey) {
      const action = await vscode.window.showWarningMessage(
        `O perfil "${profile.name}" precisa de API key antes de iniciar.`,
        'Cadastrar chave'
      );

      if (action === 'Cadastrar chave') {
        await configureProfileApiKey(this.profileStore, profile);
        await this.sendHydrate();
      }

      apiKey = await this.profileStore.getSecret(profile);
      if (!apiKey) {
        return undefined;
      }
    }

    const cwd = getWorkspaceCwd();
    this.openClaudePaths.ensureProjectState(cwd);
    this.openClaudePaths.syncProjectLegacyBridge(cwd);
    const id = createId('chat');
    const historyMessages = options.resumeSessionId ? this.historyStore.loadMessages(options.resumeSessionId) : [];
    let title = 'Novo chat';
    if (options.resumeSessionId) {
      const firstUserMessage = historyMessages.find((message) => message.role === 'user');
      title = deriveChatTitle(firstUserMessage?.text, `Retomado ${this.shortSessionId(options.resumeSessionId)}`);
    }
    const session = {
      id,
      openClaudeSessionId: options.resumeSessionId || undefined,
      title,
      cwd,
      profileId: profile.id,
      profileName: profile.name,
      model: profile.model,
      profileSnapshot: { ...profile },
      messages: historyMessages,
      status: 'Iniciando OpenClaude...',
      streaming: false,
      closed: false,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      process: undefined,
      currentAssistantId: undefined,
      currentThinkingId: undefined,
      pendingPermissions: [],
      pendingControlRequests: new Map(),
      recentRetryKeys: new Map(),
      runtimeGeneration: 0,
      modeSwitching: false,
      pendingMode: undefined,
      runtimeCapabilities: undefined,
      // Live runtime knobs — surfaced in the chat UI and pushed back to the
      // SDK via control_request when changed mid-session.
      permissionMode: options.permissionMode || DEFAULT_PERMISSION_MODE,
      thinkingEnabled: Boolean(options.thinkingEnabled),
      mode: SESSION_MODES.includes(options.mode) ? options.mode : DEFAULT_SESSION_MODE,
      // Skills opted-in per-session (Rodada 17). Contains skill ids from the
      // user's ~/.openclaude/skills.library/ — each one is injected into the
      // prompt at sendUserMessage time. Empty by default; user adds via UI.
      activeSkills: Array.isArray(options.activeSkills) ? options.activeSkills.slice() : []
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.postMessage({
      type: 'sessionCreated',
      session: this.serializeSession(session),
      activeSessionId: this.activeSessionId
    });

    try {
      await this.startSessionRuntime(session, {
        profile,
        apiKey,
        resumeSessionId: options.resumeSessionId
      });
    } catch (error) {
      this.appendMessage(session, 'error', `Falha ao abrir OpenClaude: ${error.message}`);
      session.status = 'Erro ao iniciar';
      session.closed = true;
      this.postSessionUpdated(session);
      return undefined;
    }

    return id;
  }

  buildEnv(profile, apiKey, capabilities = resolveModelCapabilities(profile)) {
    const env = cleanProviderEnv(process.env);

    if (profile.provider === 'ollama') {
      env.CLAUDE_CODE_USE_OPENAI = '1';
      env.OPENAI_BASE_URL = profile.baseUrl || 'http://localhost:11434/v1';
      env.OPENAI_MODEL = profile.model;
      env.OPENAI_API_KEY = apiKey || 'ollama';
    } else if (profile.provider === 'openai-compatible') {
      env.CLAUDE_CODE_USE_OPENAI = '1';
      env.OPENAI_BASE_URL = profile.baseUrl || 'https://api.openai.com/v1';
      env.OPENAI_MODEL = profile.model;
      if (profile.apiFormat) {
        env.OPENAI_API_FORMAT = profile.apiFormat;
      }
      if (apiKey) {
        env.OPENAI_API_KEY = apiKey;
      } else if (isLocalBaseUrl(env.OPENAI_BASE_URL)) {
        env.OPENAI_API_KEY = 'local';
      }
    } else if (profile.provider === 'gemini') {
      env.CLAUDE_CODE_USE_GEMINI = '1';
      env.GEMINI_MODEL = profile.model || 'gemini-3-flash-preview';
      env.GEMINI_BASE_URL = profile.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai';
      if (apiKey) {
        env.GEMINI_API_KEY = apiKey;
      }
    } else if (profile.provider === 'mistral') {
      env.CLAUDE_CODE_USE_MISTRAL = '1';
      env.MISTRAL_MODEL = profile.model || 'devstral-latest';
      if (profile.baseUrl) {
        env.MISTRAL_BASE_URL = profile.baseUrl;
      }
      if (apiKey) {
        env.MISTRAL_API_KEY = apiKey;
      }
    } else if (profile.provider === 'codex') {
      env.CLAUDE_CODE_USE_OPENAI = '1';
      env.OPENAI_BASE_URL = profile.baseUrl || 'https://chatgpt.com/backend-api/codex';
      env.OPENAI_MODEL = profile.model || 'codexplan';
      if (apiKey) {
        env.CODEX_API_KEY = apiKey;
      }
    }

    if (profile.model && capabilities.contextWindow) {
      env.CLAUDE_CODE_OPENAI_CONTEXT_WINDOWS = JSON.stringify({
        [profile.model]: capabilities.contextWindow
      });
    }

    if (profile.model && capabilities.maxOutputTokens) {
      env.CLAUDE_CODE_OPENAI_MAX_OUTPUT_TOKENS = JSON.stringify({
        [profile.model]: capabilities.maxOutputTokens
      });
    }

    for (const [key, value] of Object.entries(profile.extraEnv || {})) {
      if (key && value !== undefined && value !== null) {
        env[key] = String(value);
      }
    }

    return env;
  }

  getRuntimeDir(session) {
    return path.join(session.cwd, '.openclaude', 'runtime');
  }

  writeRuntimeFile(session, fileName, content) {
    const runtimeDir = this.getRuntimeDir(session);
    fs.mkdirSync(runtimeDir, { recursive: true });
    const filePath = path.join(runtimeDir, `${session.id}-${fileName}`);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  buildModeSwitchPrompt(session, nextMode) {
    const conversational = session.messages.filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        trimString(message.text)
    );
    const recent = conversational.slice(-12);
    if (recent.length === 0) {
      return '';
    }

    const transcript = recent.map((message) => {
      const role = message.role === 'assistant' ? 'Assistente' : 'Usuario';
      const text = trimString(message.text).replace(/\s+/g, ' ');
      return `${role}: ${text.length > 1200 ? `${text.slice(0, 1197)}...` : text}`;
    }).join('\n');

    return [
      'Contexto preservado apos troca interna de modo.',
      `Novo modo ativo: ${nextMode}.`,
      'Continue a conversa abaixo sem mencionar que o runtime foi reiniciado.',
      '',
      transcript
    ].join('\n');
  }

  async buildRuntimeArtifacts(session, profile, options = {}) {
    const mode = normalizeSessionMode(session.mode);
    const mcpConfig = { mcpServers: {} };
    const runtimeSettings = {};
    const capabilities = resolveModelCapabilities(profile);
    const runtimeCapabilities = {
      mode,
      providerId: capabilities.providerId,
      providerLabel: capabilities.providerLabel,
      providerToolLimit: capabilities.maxTotalTools,
      builtInToolReserve: capabilities.builtInToolReserve,
      maxMcpTools: capabilities.maxMcpTools,
      contextWindow: capabilities.contextWindow,
      maxOutputTokens: capabilities.maxOutputTokens,
      supportsParallelTools: capabilities.supportsParallelTools,
      capabilitySource: capabilities.source,
      rufloToolsAvailable: 0,
      rufloToolsSelected: 0,
      rufloToolTier: 'none'
    };

    if (mode === 'swarm') {
      const catalogResult = await this.rufloService.getToolCatalog();
      if (!catalogResult.ok) {
        throw new Error(catalogResult.error || 'Nao consegui listar as tools do Ruflo para iniciar o Swarm.');
      }

      const selection = selectRufloTools(catalogResult.tools, capabilities.maxMcpTools);
      mcpConfig.mcpServers['claude-flow'] = {
        type: 'stdio',
        command: 'claude-flow',
        args: ['mcp', 'start'],
        env: {}
      };
      runtimeSettings.permissions = {
        deny: buildRufloDenyRules(selection.deniedNames)
      };
      Object.assign(runtimeCapabilities, {
        rufloToolsAvailable: selection.totalAvailable,
        rufloToolsSelected: selection.selectedNames.length,
        rufloToolTier: selection.tier
      });
    }

    const mcpConfigPath = this.writeRuntimeFile(
      session,
      'mcp.json',
      `${JSON.stringify(mcpConfig, null, 2)}\n`
    );
    const settingsPath = this.writeRuntimeFile(
      session,
      'settings.json',
      `${JSON.stringify(runtimeSettings, null, 2)}\n`
    );
    const continuationPrompt = options.continuationPrompt || '';
    const continuationPromptPath = continuationPrompt
      ? this.writeRuntimeFile(session, 'continuation.txt', continuationPrompt)
      : undefined;

    return {
      mcpConfigPath,
      settingsPath,
      continuationPromptPath,
      runtimeCapabilities
    };
  }

  async startSessionRuntime(session, options = {}) {
    const profile = options.profile || session.profileSnapshot;
    const apiKey = options.apiKey !== undefined
      ? options.apiKey
      : await this.profileStore.getSecret(profile);
    const artifacts = await this.buildRuntimeArtifacts(session, profile, {
      continuationPrompt: options.continuationPrompt
    });
    const env = this.buildEnv(profile, apiKey, artifacts.runtimeCapabilities);
    const args = [
      '--print',
      '--verbose',
      '--input-format=stream-json',
      '--output-format=stream-json',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      '--allow-dangerously-skip-permissions',
      '--permission-mode',
      session.permissionMode,
      '--model',
      profile.model,
      '--strict-mcp-config',
      '--mcp-config',
      artifacts.mcpConfigPath,
      '--settings',
      artifacts.settingsPath
    ];

    if (artifacts.continuationPromptPath) {
      args.push('--append-system-prompt-file', artifacts.continuationPromptPath);
    }

    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    const commandLine = [quoteCmdArg(OPENCLAUDE_CMD), ...args.map(quoteCmdArg)].join(' ');
    const child = spawn(commandLine, [], {
      cwd: session.cwd,
      env,
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const generation = (session.runtimeGeneration || 0) + 1;
    session.runtimeGeneration = generation;
    session.process = child;
    session.closed = false;
    session.streaming = false;
    session.runtimeCapabilities = artifacts.runtimeCapabilities;
    session.status = options.resumeSessionId
      ? 'Sessao retomada. Envie uma mensagem para continuar.'
      : session.modeSwitching
        ? `Modo ${session.pendingMode === 'swarm' ? 'Swarm' : 'Single'} pronto.`
        : 'Pronto para conversar.';
    this.postSessionUpdated(session);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => this.handleProcessStdout(session.id, chunk));
    child.stderr.on('data', (chunk) => this.handleProcessStderr(session.id, chunk));
    child.on('error', (error) => {
      const current = this.sessions.get(session.id);
      if (!current || current.runtimeGeneration !== generation) {
        return;
      }

      this.appendMessage(current, 'error', `Falha ao iniciar OpenClaude: ${error.message}`);
      current.status = 'Erro ao iniciar';
      current.closed = true;
      current.modeSwitching = false;
      current.pendingMode = undefined;
      this.postSessionUpdated(current);
    });
    child.on('exit', (code, signal) => {
      const current = this.sessions.get(session.id);
      if (!current || current.runtimeGeneration !== generation) {
        return;
      }

      this.flushProcessBuffers(current.id);
      current.closed = true;
      current.streaming = false;
      current.status = signal ? `Encerrado por ${signal}` : `Finalizado com codigo ${code}`;

      for (const message of current.messages) {
        if (message.role === 'tool' && message.toolStatus !== 'success' && message.toolStatus !== 'error') {
          message.toolStatus = 'error';
          message.toolResult = 'Sessão encerrada antes de receber resposta.';
          message.final = true;
          message.toolSummary = computeToolSummary(message);
        }
      }

      this.finishAssistant(current);
      this.postSessionUpdated(current);
    });
  }

  async sendUserMessage(sessionId, text) {
    const cleanText = trimString(text);
    if (!cleanText) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (!session.process || session.closed) {
      this.appendMessage(session, 'error', 'Esse chat esta fechado. Retome a sessao pelo historico ou abra um novo chat.');
      this.postSessionUpdated(session);
      return;
    }

    this.appendMessage(session, 'user', cleanText);

    // First user message in this session → use it as the tab title so it's
    // readable instead of "Chat <session-id>". Only fires once per session
    // because we check the count of user messages we've appended so far.
    const userMessageCount = session.messages.reduce(
      (acc, message) => (message.role === 'user' ? acc + 1 : acc),
      0
    );
    if (userMessageCount === 1) {
      session.title = deriveChatTitle(cleanText, session.title);
    }

    session.status = 'Enviando mensagem...';
    session.streaming = true;
    session.currentAssistantId = undefined;
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);

    // Compose what the LLM actually sees. Two invisible wrappers (neither
    // appears in the transcript the user reads):
    //   1) Skills opted-in via the per-session picker → full SKILL.md body
    //      injected as instructions ahead of the user text
    //   2) Swarm mode → a short Ruflo MCP nudge
    // Skills go first so the model treats them as "rules"; the swarm hint
    // sits right above the user message.
    const wrappers = [];

    if (Array.isArray(session.activeSkills) && session.activeSkills.length > 0) {
      const blocks = [];
      for (const skillId of session.activeSkills) {
        const skill = this.skillsStore.loadSkillContent(skillId);
        if (!skill) continue;
        const skillName = (skill.frontmatter && skill.frontmatter.name) || skillId;
        blocks.push(`## Skill: ${skillName}\n\n${skill.body}`);
      }
      if (blocks.length > 0) {
        wrappers.push(
          `[Skills ativas nesta sessão — siga as instruções abaixo quando o contexto bater:]\n\n${blocks.join('\n\n---\n\n')}`
        );
      }
    }

    if (normalizeSessionMode(session.mode) === 'swarm') {
      wrappers.push(RUFLO_PROMPT_PREFIX.trim());
    }

    const contentForLlm = wrappers.length > 0
      ? `${wrappers.join('\n\n')}\n\n---\n\n${cleanText}`
      : cleanText;

    const payload = {
      type: 'user',
      message: {
        role: 'user',
        content: contentForLlm
      },
      parent_tool_use_id: null
    };

    session.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  sendPermissionResponse(sessionId, requestId, decision, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session?.process) {
      return;
    }

    // The SDK validates this against PermissionAllowResultSchema /
    // PermissionDenyResultSchema in cli.mjs:557060. Allow requires
    // `behavior: 'allow'` + `updatedInput` (we just echo the original
    // input back). Deny requires `behavior: 'deny'` + `message`.
    let responseBody;
    if (decision === 'allow') {
      responseBody = {
        behavior: 'allow',
        updatedInput: options.toolInput || {}
      };
    } else {
      responseBody = {
        behavior: 'deny',
        message: (options.suggestion && options.suggestion.trim())
          ? options.suggestion.trim()
          : 'O usuário negou essa ação.'
      };
    }

    const payload = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: responseBody
      }
    };

    session.process.stdin.write(`${JSON.stringify(payload)}\n`);
    session.pendingPermissions = session.pendingPermissions.filter((item) => item.id !== requestId);

    // Surface the suggestion in the chat as a system note so the user can
    // see what they told the agent. It also acts as visual confirmation.
    if (decision === 'deny' && options.suggestion && options.suggestion.trim()) {
      this.appendMessage(session, 'system', `Sugerido ao agente: ${options.suggestion.trim()}`, {
        title: 'Sugestão',
        final: true
      });
    }

    this.postSessionUpdated(session);
  }

  // Sends a control_request to the OpenClaude process via stdin. Used to
  // change live session settings (permission mode, thinking budget, model)
  // without restarting the chat — the SDK supports these subtypes natively.
  sendControlRequest(session, request, metadata) {
    if (!session?.process || session.closed) {
      return undefined;
    }

    const requestId = createId('control');
    const payload = {
      type: 'control_request',
      request_id: requestId,
      request
    };
    if (metadata) {
      session.pendingControlRequests.set(requestId, metadata);
    }
    session.process.stdin.write(`${JSON.stringify(payload)}\n`);
    return requestId;
  }

  setSessionPermissionMode(sessionId, mode) {
    if (!PERMISSION_MODES.includes(mode)) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.permissionMode === mode) {
      return;
    }

    if (session.process && !session.closed) {
      if (this.hasPendingControlRequest(session, 'permissionMode')) {
        return;
      }

      this.sendControlRequest(
        session,
        { subtype: 'set_permission_mode', mode },
        {
          kind: 'permissionMode',
          previousValue: session.permissionMode,
          nextValue: mode
        }
      );
      return;
    }

    session.permissionMode = mode;
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);
  }

  setSessionThinking(sessionId, enabled) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.thinkingEnabled === enabled) {
      return;
    }

    if (session.process && !session.closed) {
      if (this.hasPendingControlRequest(session, 'thinking')) {
        return;
      }

      this.sendControlRequest(
        session,
        {
          subtype: 'set_max_thinking_tokens',
          max_thinking_tokens: enabled ? THINKING_TOKEN_BUDGET : 0
        },
        {
          kind: 'thinking',
          previousValue: session.thinkingEnabled,
          nextValue: enabled
        }
      );
      return;
    }

    session.thinkingEnabled = enabled;
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);
  }

  hasPendingControlRequest(session, kind) {
    if (!session?.pendingControlRequests) {
      return false;
    }

    for (const pending of session.pendingControlRequests.values()) {
      if (pending.kind === kind) {
        return true;
      }
    }

    return false;
  }

  // Operation mode switch — single / swarm. Each mode has a different runtime
  // surface, so changing it rebuilds the OpenClaude process behind the same UI
  // session instead of pretending a prompt prefix alone changed capabilities.
  async setSessionMode(sessionId, mode) {
    const normalized = normalizeSessionMode(mode);

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.mode === normalized) {
      return;
    }

    if (session.streaming) {
      this.showError('Interrompa a resposta atual antes de trocar o modo do chat.');
      return;
    }

    const previousMode = normalizeSessionMode(session.mode);
    const previousProcess = session.process;
    session.modeSwitching = true;
    session.pendingMode = normalized;
    session.status = normalized === 'swarm' ? 'Ativando modo Swarm...' : 'Ativando modo Single...';
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);

    try {
      const continuationPrompt = this.buildModeSwitchPrompt(session, normalized);
      session.mode = normalized;
      session.pendingControlRequests.clear();
      session.recentRetryKeys.clear();
      session.process = undefined;
      // Invalidate callbacks from the process we are about to kill before the
      // OS has a chance to deliver its exit event.
      session.runtimeGeneration += 1;
      if (previousProcess) {
        try {
          previousProcess.kill();
        } catch {
          // The process may already be gone while the user toggles mode.
        }
      }

      await this.startSessionRuntime(session, {
        profile: session.profileSnapshot,
        continuationPrompt
      });
      session.modeSwitching = false;
      session.pendingMode = undefined;
      session.updatedAt = nowIso();
      this.postSessionUpdated(session);
    } catch (error) {
      session.mode = previousMode;
      session.modeSwitching = false;
      session.pendingMode = undefined;
      session.updatedAt = nowIso();
      this.appendMessage(session, 'error', `Nao consegui trocar o modo: ${error.message}`);
      try {
        await this.startSessionRuntime(session, {
          profile: session.profileSnapshot,
          continuationPrompt: this.buildModeSwitchPrompt(session, previousMode)
        });
      } catch (restartError) {
        session.closed = true;
        session.status = 'Erro ao restaurar sessao';
        this.appendMessage(session, 'error', `Tambem nao consegui restaurar o modo anterior: ${restartError.message}`);
      }
      this.postSessionUpdated(session);
    }
  }

  // Adds a skill from the user's library (~/.openclaude/skills.library/) to
  // a session's active set. The skill body is injected into outgoing prompts
  // in sendUserMessage — so it only costs tokens on this session, never
  // globally. No-op if the skill doesn't exist in the library or is already
  // active.
  addSkillToSession(sessionId, skillId) {
    if (!skillId || typeof skillId !== 'string') return;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!Array.isArray(session.activeSkills)) {
      session.activeSkills = [];
    }
    // Confirm the skill exists in the library before adding. loadSkillContent
    // also guards against path traversal in skillId.
    const skill = this.skillsStore.loadSkillContent(skillId);
    if (!skill) return;
    if (session.activeSkills.includes(skillId)) return;
    session.activeSkills.push(skillId);
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);
  }

  removeSkillFromSession(sessionId, skillId) {
    if (!skillId) return;
    const session = this.sessions.get(sessionId);
    if (!session || !Array.isArray(session.activeSkills)) return;
    const idx = session.activeSkills.indexOf(skillId);
    if (idx === -1) return;
    session.activeSkills.splice(idx, 1);
    session.updatedAt = nowIso();
    this.postSessionUpdated(session);
  }

  async checkRufloEnvironment(options = {}) {
    return await this.rufloService.getStatus({
      workspaceCwd: getWorkspaceCwd(),
      force: Boolean(options.force)
    });
  }

  async runRufloAction(action) {
    const cwd = getWorkspaceCwd();
    let result;

    try {
      if (action === 'registerMcp') {
        result = this.rufloService.registerWorkspaceMcp(cwd);
      } else if (action === 'removeMcp') {
        result = this.rufloService.removeWorkspaceMcp(cwd);
      } else if (action === 'activateAll') {
        result = await this.rufloService.activateWorkspace(cwd);
      } else if (action === 'startDaemon') {
        result = await this.rufloService.startDaemon(cwd);
      } else if (action === 'stopDaemon') {
        result = await this.rufloService.stopDaemon(cwd);
      } else if (action === 'doctor') {
        result = await this.rufloService.runDoctor(cwd);
      } else if (action === 'initMemory') {
        result = await this.rufloService.initializeMemory(cwd);
      } else if (action === 'deleteMemory') {
        result = this.rufloService.deleteMemory(cwd);
      } else {
        return;
      }
    } catch (error) {
      result = {
        ok: false,
        message: `A acao do Ruflo falhou: ${error.message}`,
        error: error.message
      };
    }

    const status = await this.checkRufloEnvironment({ force: true });
    this.postMessage({
      type: 'rufloActionResult',
      action,
      result,
      status
    });
    this.postMessage({ type: 'rufloStatus', status });

    if (result?.ok) {
      vscode.window.showInformationMessage(result.message);
    } else {
      vscode.window.showErrorMessage(result?.message || 'A acao do Ruflo falhou.');
    }
  }

  // Opens the Ruflo CLI in a fresh VS Code integrated terminal, preloaded
  // with the env vars of the user's currently-active openclaude profile so
  // the CLI authenticates against the same API key/provider. This is the
  // "Fase Bônus" entry point — gives the user 100% of the Ruflo CLI
  // surface area without leaving the editor.
  async openRufloCli() {
    const profile = await this.profileStore.getActiveProfile();
    if (!profile) {
      vscode.window.showWarningMessage(
        'Selecione um perfil OpenClaude antes de abrir o Ruflo CLI.'
      );
      return;
    }

    let apiKey;
    try {
      apiKey = await this.profileStore.getSecret(profile);
    } catch (_err) {
      apiKey = undefined;
    }

    if (profileNeedsApiKey(profile) && !apiKey) {
      const action = await vscode.window.showWarningMessage(
        `O perfil "${profile.name}" precisa de API key. Cadastrar agora?`,
        'Cadastrar',
        'Cancelar'
      );
      if (action !== 'Cadastrar') {
        return;
      }
      await configureProfileApiKey(this.profileStore, profile);
      apiKey = await this.profileStore.getSecret(profile);
    }

    // buildEnv returns an env-like object with cleaned provider keys for the
    // active profile. We sanitize to strings because vscode.createTerminal
    // refuses non-string env values.
    const env = this.buildEnv(profile, apiKey);
    const sanitized = {};
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string') sanitized[k] = v;
    }

    // Force a native Windows shell so PATH points to npm-global where
    // claude-flow.cmd lives, and the env vars assembled above are honored.
    // Also extend PATH with %APPDATA%\npm in case the inherited PATH from
    // VS Code's launcher missed it.
    const isWindows = process.platform === 'win32';
    if (isWindows && process.env.APPDATA) {
      const globalNpm = path.join(process.env.APPDATA, 'npm');
      const existing = sanitized.PATH || sanitized.Path || process.env.PATH || '';
      sanitized.PATH = `${globalNpm};${existing}`;
    }

    const terminal = vscode.window.createTerminal({
      name: 'Ruflo CLI',
      cwd: getWorkspaceCwd(),
      env: sanitized,
      shellPath: isWindows ? (process.env.ComSpec || 'cmd.exe') : undefined,
    });
    // claude-flow is NOT a chat — it's a toolkit CLI with discrete commands.
    // Running it without args just prints help and exits to prompt. We launch
    // `claude-flow doctor` to give the user a useful starting view (diagnoses
    // env, providers, MCP status) and leave the prompt open for follow-ups.
    terminal.sendText('claude-flow doctor', true);
    terminal.show();
  }

  handleProcessStdout(sessionId, chunk) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const buffer = (this.stdoutBuffers.get(sessionId) || '') + chunk;
    const lines = buffer.split(/\r?\n/);
    this.stdoutBuffers.set(sessionId, lines.pop() || '');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const message = readJsonLine(trimmed);
      if (!message) {
        this.appendMessage(session, 'system', trimmed);
        continue;
      }

      this.handleSdkMessage(session, message);
    }

    this.postSessionUpdated(session);
  }

  handleProcessStderr(sessionId, chunk) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const buffer = (this.stderrBuffers.get(sessionId) || '') + chunk;
    const lines = buffer.split(/\r?\n/);
    this.stderrBuffers.set(sessionId, lines.pop() || '');

    for (const line of lines) {
      const text = line.trim();
      if (!text) {
        continue;
      }

      if (/^(Warning|Info|Loaded|OpenClaude|\[context\]\s+Warning)/i.test(text)) {
        session.status = text;
      } else {
        this.appendMessage(session, 'error', text);
        session.status = 'OpenClaude reportou um erro';
      }
    }

    this.postSessionUpdated(session);
  }

  flushProcessBuffers(sessionId) {
    const stdout = this.stdoutBuffers.get(sessionId);
    const stderr = this.stderrBuffers.get(sessionId);

    if (stdout) {
      this.handleProcessStdout(sessionId, `${stdout}\n`);
    }

    this.stdoutBuffers.delete(sessionId);
    this.stderrBuffers.delete(sessionId);

    if (stderr) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.appendMessage(session, 'error', stderr.trim());
      }
    }
  }

  handleSdkMessage(session, message) {
    // We track the OpenClaude session id internally (used by --resume), but
    // we no longer overwrite the human-friendly tab title with it — the
    // title comes from the first user message via deriveChatTitle().
    if (message.session_id && !session.openClaudeSessionId) {
      session.openClaudeSessionId = message.session_id;
    }

    if (message.type === 'api_retry') {
      if (!this.isDuplicateRetry(session, message)) {
        this.appendSdkNotice(session, 'OpenClaude esta tentando chamar a API novamente', message);
      }
      session.status = 'Tentando novamente...';
      return;
    }

    if (message.type === 'api_error' || message.type === 'rate_limit' || message.type === 'connection_error') {
      this.appendSdkNotice(session, 'Erro de API do OpenClaude', message, 'error');
      session.status = 'Erro de API';
      return;
    }

    if (message.type === 'system') {
      session.status = message.subtype || message.event || 'Sistema pronto';
      if (message.model) {
        session.model = message.model;
      }
      if (message.subtype === 'api_retry' || message.event === 'api_retry') {
        if (!this.isDuplicateRetry(session, message)) {
          this.appendSdkNotice(session, 'OpenClaude esta tentando chamar a API novamente', message);
        }
        session.status = 'Tentando novamente...';
      }
      return;
    }

    if (message.type === 'control_request') {
      // The SDK puts the actual permission payload under `request`. We pull
      // tool_name + input + tool_use_id out so the webview can render a
      // proper card (and so "deny with suggestion" can reference the tool).
      const inner = message.request || {};
      const requestId = message.request_id || message.id || createId('permission');
      const toolName = inner.tool_name || message.tool_name || message.title;
      const toolInput = inner.input || message.input || {};
      const toolUseId = inner.tool_use_id || message.tool_use_id;
      const description = inner.description || inner.decision_reason || message.description;

      session.pendingPermissions.push({
        id: requestId,
        toolName: toolName || 'Ferramenta',
        toolInput,
        toolUseId,
        description,
        // Preserve the original raw request as a fallback detail when we
        // don't recognize the shape.
        rawDetail: extractMessageText(message) || JSON.stringify(message, null, 2)
      });
      session.status = 'Aguardando permissao';
      return;
    }

    if (message.type === 'control_response') {
      this.handleControlResponse(session, message);
      return;
    }

    if (message.type === 'stream_event') {
      this.handleStreamEvent(session, message.event || {});
      return;
    }

    if (message.type === 'assistant') {
      const text = extractMessageText(message);
      const toolUses = extractToolUses(message.message?.content || message.content);

      for (const tool of toolUses) {
        // Upsert keyed by tool_use_id so this merges with the card created
        // by content_block_start instead of pushing a duplicate.
        this.upsertToolCard(session, tool.id, {
          toolName: tool.name,
          toolInput: tool.input || {},
          toolStatus: 'running',
          final: false
        });
      }

      if (text) {
        // The `assistant` event arrives AFTER stream_event/message_stop, which
        // already cleared currentAssistantId via finishAssistant(). So we
        // can't only check getCurrentAssistant — we have to compare against
        // the last assistant message in the log too, otherwise we'd append
        // a duplicate of the streamed content.
        const target = this.getCurrentAssistant(session) || this.findLastAssistantMessage(session);
        if (target && this.assistantTextMatches(target.text, text)) {
          target.text = text;
          target.final = true;
        } else {
          this.appendMessage(session, 'assistant', text, { final: true });
        }
      }

      this.finishAssistant(session);
      session.status = 'Resposta recebida';
      return;
    }

    if (message.type === 'partial') {
      const text = extractMessageText(message);
      if (text) {
        const current = this.getCurrentAssistant(session);
        if (current) {
          current.text = text;
          current.final = false;
        } else {
          const assistant = this.appendMessage(session, 'assistant', text, { final: false });
          session.currentAssistantId = assistant.id;
        }
        session.streaming = true;
        session.status = 'Recebendo resposta...';
      }
      return;
    }

    if (message.type === 'user') {
      // The "user" event from the SDK carries either a regular user echo
      // (rare in our setup) OR tool_result blocks for previously dispatched
      // tools. We attribute results back to the matching card via
      // tool_use_id, instead of printing them as a separate "[tool: X]"
      // line like the old regex-based path did.
      const content = message.message?.content || message.content;
      const toolResults = Array.isArray(content)
        ? content.filter((item) => item && item.type === 'tool_result')
        : [];

      if (toolResults.length > 0) {
        for (const result of toolResults) {
          const resultText = extractTextFromContent(result.content) || '';
          this.upsertToolCard(session, result.tool_use_id, {
            toolResult: resultText,
            toolStatus: result.is_error ? 'error' : 'success',
            final: true
          });
        }
        return;
      }

      // Fallback for any rare non-tool user echo — surface as a system note.
      const text = extractMessageText(message);
      if (text) {
        this.appendMessage(session, 'system', text, { final: true });
      }
      return;
    }

    if (message.type === 'result') {
      const text = extractMessageText(message);
      if (text) {
        // Same dedup story as the `assistant` event: by the time `result`
        // arrives, the streamed message is finalized but the text is the
        // same. Don't append a duplicate.
        const lastAssistant = this.findLastAssistantMessage(session);
        if (!lastAssistant || !this.assistantTextMatches(lastAssistant.text, text)) {
          this.appendMessage(session, 'assistant', text, { final: true });
        } else {
          lastAssistant.text = text;
          lastAssistant.final = true;
        }
      }
      this.finishAssistant(session);
      // The `result` event is the canonical "turn is over" signal and by
      // here all tool_results are settled — this is the most reliable place
      // to compute the files-changed summary.
      this.appendFilesChangedSummary(session);
      session.status = message.subtype === 'success' || message.is_error === false ? 'Pronto' : 'Turno finalizado';
      session.streaming = false;
      return;
    }

    if (message.type === 'error') {
      this.appendMessage(session, 'error', describeSdkPayload(message));
      session.status = 'Erro';
      return;
    }

    if (message.type === 'status' || message.type === 'tool_progress') {
      const statusText = extractMessageText(message) || message.status || message.type;
      if (statusText === 'api_retry') {
        if (!this.isDuplicateRetry(session, message)) {
          this.appendSdkNotice(session, 'OpenClaude esta tentando chamar a API novamente', message);
        }
        session.status = 'Tentando novamente...';
      } else if (statusText === 'api_error' || statusText === 'rate_limit' || statusText === 'connection_error') {
        this.appendSdkNotice(session, 'Erro de API do OpenClaude', message, 'error');
        session.status = 'Erro de API';
      } else {
        session.status = statusText;
      }
      return;
    }

    const fallback = extractMessageText(message);
    if (fallback) {
      this.appendMessage(session, 'system', fallback);
      return;
    }

    if (message.type) {
      this.appendSdkNotice(session, `Evento do OpenClaude: ${message.type}`, message);
    }
  }

  handleStreamEvent(session, event) {
    if (!event || typeof event !== 'object') {
      return;
    }

    if (event.type === 'api_retry') {
      if (!this.isDuplicateRetry(session, event)) {
        this.appendSdkNotice(session, 'OpenClaude esta tentando chamar a API novamente', event);
      }
      session.status = 'Tentando novamente...';
      return;
    }

    if (event.type === 'api_error' || event.type === 'rate_limit' || event.type === 'connection_error') {
      this.appendSdkNotice(session, 'Erro de API do OpenClaude', event, 'error');
      session.status = 'Erro de API';
      return;
    }

    if (event.type === 'message_start') {
      session.status = 'Pensando...';
      session.streaming = true;
      return;
    }

    if (event.type === 'content_block_start') {
      const block = event.content_block || {};
      if (block.type === 'tool_use') {
        // A new tool block ends any in-flight assistant/thinking text.
        // We upsert a card keyed by tool_use_id with whatever input we have
        // (often empty here — populated later by the assistant event).
        this.finishThinking(session);
        this.finishAssistant(session);
        this.upsertToolCard(session, block.id, {
          toolName: block.name || 'tool',
          toolInput: block.input || {},
          toolStatus: 'running',
          final: false
        });
      } else if (block.type === 'thinking') {
        this.finishAssistant(session);
        if (block.thinking) {
          this.appendThinkingDelta(session, block.thinking);
        }
      } else if (block.type === 'text') {
        // Switching from thinking to assistant text — close the thinking
        // block so the next text deltas land in a fresh assistant message.
        this.finishThinking(session);
        if (block.text) {
          this.appendAssistantDelta(session, block.text);
        }
      }
      return;
    }

    if (event.type === 'content_block_stop') {
      // SDK signals end of a single content block (text/thinking/tool_use).
      // We close whichever message we were appending into.
      this.finishThinking(session);
      return;
    }

    if (event.type === 'content_block_delta') {
      const delta = event.delta || {};
      if (delta.text) {
        // If we were inside a thinking block, this delta starts the actual
        // answer — close thinking first.
        if (session.currentThinkingId) {
          this.finishThinking(session);
        }
        this.appendAssistantDelta(session, delta.text);
      } else if (delta.thinking) {
        this.appendThinkingDelta(session, delta.thinking);
      } else if (delta.partial_json) {
        session.status = 'Preparando chamada de ferramenta...';
      }
      return;
    }

    if (event.type === 'message_delta') {
      session.status = 'Recebendo resposta...';
      return;
    }

    if (event.type === 'message_stop') {
      this.finishThinking(session);
      this.finishAssistant(session);
      // We try to append the files-changed summary here, but the actual
      // tool_results may still be inflight at this point (status: running).
      // The same call also fires at the `result` event below, where the
      // turn is fully done and all tool statuses are settled. The dedup
      // inside appendFilesChangedSummary keeps it idempotent.
      this.appendFilesChangedSummary(session);
      session.status = 'Pronto';
      session.streaming = false;
    }
  }

  // Walk session.messages backwards from the end to the most recent user
  // message, collect Write/Edit/MultiEdit/NotebookEdit cards, and append a
  // single 'files-changed' summary card at the end of the assistant turn.
  appendFilesChangedSummary(session) {
    const messages = session.messages;
    let userBoundary = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        userBoundary = i;
        break;
      }
    }

    const summary = computeFilesChangedSummaryForRange(messages, userBoundary + 1, messages.length);
    if (!summary) return;

    // Remove any prior summary card from this same turn so successive
    // message_stop / result calls don't stack duplicates.
    for (let i = messages.length - 1; i > userBoundary; i -= 1) {
      if (messages[i].role === 'files-changed') {
        messages.splice(i, 1);
      }
    }

    messages.push(summary);
    session.updatedAt = nowIso();
  }

  isDuplicateRetry(session, payload) {
    if (!session.recentRetryKeys) {
      session.recentRetryKeys = new Map();
    }

    const requestId = payload?.request_id ?? payload?.requestId ?? '';
    const attempt = payload?.attempt ?? payload?.retry_count ?? '';
    const delay = payload?.retry_after_ms ?? payload?.retryAfterMs ?? payload?.delay_ms ?? payload?.delayMs ?? '';
    const key = `${requestId}|${attempt}|${delay}`;

    if (key === '||') {
      return false;
    }

    const now = Date.now();
    for (const [storedKey, timestamp] of session.recentRetryKeys) {
      if (now - timestamp > 5000) {
        session.recentRetryKeys.delete(storedKey);
      }
    }

    const last = session.recentRetryKeys.get(key);
    if (last && now - last < 500) {
      return true;
    }

    session.recentRetryKeys.set(key, now);
    return false;
  }

  appendSdkNotice(session, title, payload, role = 'system') {
    const text = describeSdkPayload(payload);
    this.appendMessage(session, role, text, {
      title,
      final: true
    });
  }

  handleControlResponse(session, message) {
    const response = message.response || {};
    const requestId = response.request_id;
    const pending = requestId ? session.pendingControlRequests?.get(requestId) : undefined;

    if (!pending) {
      return;
    }

    session.pendingControlRequests.delete(requestId);

    if (response.subtype === 'success') {
      if (pending.kind === 'permissionMode') {
        session.permissionMode = response.response?.mode || pending.nextValue;
      } else if (pending.kind === 'thinking') {
        session.thinkingEnabled = pending.nextValue;
      }
    } else {
      if (pending.kind === 'permissionMode') {
        session.permissionMode = pending.previousValue;
      } else if (pending.kind === 'thinking') {
        session.thinkingEnabled = pending.previousValue;
      }

      const detail = trimString(response.error) || 'o OpenClaude rejeitou a mudanca.';
      if (pending.kind === 'permissionMode') {
        this.showError(`Nao foi possivel mudar o modo de permissao para "${pending.nextValue}": ${detail}`);
      } else if (pending.kind === 'thinking') {
        this.showError(`Nao foi possivel ${pending.nextValue ? 'ativar' : 'desativar'} o Thinking: ${detail}`);
      }
    }

    session.updatedAt = nowIso();
    this.postSessionUpdated(session);
  }

  appendAssistantDelta(session, text) {
    if (!text) {
      return;
    }

    let message = this.getCurrentAssistant(session);
    if (!message) {
      message = this.appendMessage(session, 'assistant', '', { final: false });
      session.currentAssistantId = message.id;
    }

    message.text += text;
    message.final = false;
    session.streaming = true;
    session.status = 'Recebendo resposta...';
    session.updatedAt = nowIso();
  }

  // Thinking deltas live in their own collapsible message above the answer
  // so the user can inspect the chain-of-thought without it cluttering the
  // main response.
  appendThinkingDelta(session, text) {
    if (!text) {
      return;
    }

    let message = this.getCurrentThinking(session);
    if (!message) {
      message = this.appendMessage(session, 'thinking', '', { final: false, title: 'Pensando' });
      session.currentThinkingId = message.id;
    }

    message.text += text;
    message.final = false;
    session.streaming = true;
    session.status = 'Raciocinando...';
    session.updatedAt = nowIso();
  }

  getCurrentThinking(session) {
    if (!session.currentThinkingId) {
      return undefined;
    }

    return session.messages.find((message) => message.id === session.currentThinkingId);
  }

  finishThinking(session) {
    const current = this.getCurrentThinking(session);
    if (current) {
      current.final = true;
    }
    session.currentThinkingId = undefined;
    session.updatedAt = nowIso();
  }

  getCurrentAssistant(session) {
    if (!session.currentAssistantId) {
      return undefined;
    }

    return session.messages.find((message) => message.id === session.currentAssistantId);
  }

  findLastAssistantMessage(session) {
    for (let i = session.messages.length - 1; i >= 0; i -= 1) {
      if (session.messages[i].role === 'assistant') {
        return session.messages[i];
      }
    }

    return undefined;
  }

  // Tells us whether two assistant texts are "the same answer" — used to
  // collapse the streamed message with the full-text `assistant` and `result`
  // events that OpenClaude sends after streaming completes.
  assistantTextMatches(existing, incoming) {
    if (!existing || !incoming) {
      return false;
    }

    if (existing === incoming) {
      return true;
    }

    return incoming.startsWith(existing) || existing.startsWith(incoming);
  }

  finishAssistant(session) {
    const current = this.getCurrentAssistant(session);
    if (current) {
      current.final = true;
    }

    session.currentAssistantId = undefined;
    session.streaming = false;
    session.updatedAt = nowIso();
  }

  // Single source of truth for tool messages — keyed by tool_use_id so all
  // events for one tool call (content_block_start, the populated assistant
  // event, the tool_result in the user event) merge into the same card
  // instead of producing 3-5 fragmented messages.
  upsertToolCard(session, toolUseId, patch) {
    if (!toolUseId) {
      // Fallback: if for some reason we don't have an id, still render as
      // a tool message so we don't silently drop the event.
      const fakeId = createId('tool');
      const card = this.appendMessage(session, 'tool', '', {
        title: patch.toolName || 'Ferramenta',
        final: false
      });
      Object.assign(card, {
        toolUseId: fakeId,
        toolName: patch.toolName || 'tool',
        toolInput: patch.toolInput || {},
        toolStatus: patch.toolStatus || 'pending',
        toolResult: patch.toolResult ?? null,
        ...patch
      });
      card.toolSummary = computeToolSummary(card);
      session.updatedAt = nowIso();
      return card;
    }

    let card = session.messages.find(
      (message) => message.role === 'tool' && message.toolUseId === toolUseId
    );

    if (!card) {
      card = this.appendMessage(session, 'tool', '', {
        title: patch.toolName || 'Ferramenta',
        final: false
      });
      card.toolUseId = toolUseId;
      card.toolName = patch.toolName || 'tool';
      card.toolInput = patch.toolInput || {};
      card.toolStatus = patch.toolStatus || 'pending';
      card.toolResult = patch.toolResult ?? null;
    }

    // Merge the patch — only overwriting fields the patch actually carries.
    if (patch.toolName) card.toolName = patch.toolName;
    if (patch.toolInput !== undefined) card.toolInput = patch.toolInput;
    if (patch.toolStatus) card.toolStatus = patch.toolStatus;
    if (patch.toolResult !== undefined) card.toolResult = patch.toolResult;
    if (patch.title) card.title = patch.title;
    if (typeof patch.final === 'boolean') card.final = patch.final;

    card.toolSummary = computeToolSummary(card);
    card.text = card.toolSummary; // Legacy/text fallback for older renderers.

    session.status = `Usando ferramenta: ${card.toolName}`;
    session.updatedAt = nowIso();
    return card;
  }

  appendMessage(session, role, text, options = {}) {
    const message = {
      id: createId('msg'),
      role,
      text: String(text || ''),
      title: options.title,
      final: options.final !== false,
      createdAt: nowIso()
    };

    session.messages.push(message);
    session.updatedAt = nowIso();
    return message;
  }

  stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.process?.kill();
    } catch {
      // The process may already be gone.
    }

    session.closed = true;
    session.streaming = false;
    session.status = 'Interrompido pelo usuario';
    this.finishAssistant(session);
    this.postSessionUpdated(session);
  }

  closeSession(sessionId) {
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.process?.kill();
    } catch {
      // The process may already be gone.
    }

    this.sessions.delete(sessionId);
    this.stdoutBuffers.delete(sessionId);
    this.stderrBuffers.delete(sessionId);

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = Array.from(this.sessions.keys()).at(-1);
    }

    this.postMessage({
      type: 'sessionClosed',
      sessionId,
      activeSessionId: this.activeSessionId
    });
  }

  closeActiveSession() {
    this.closeSession(this.activeSessionId);
  }

  async deleteHistorySession(sessionId, title) {
    if (!sessionId) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Apagar histórico "${title || sessionId}"? Será movido para ${this.openClaudePaths.deletedHistoryDir}.`,
      'Apagar',
      'Cancelar'
    );

    if (confirm !== 'Apagar') {
      await this.sendHydrate();
      return;
    }

    try {
      this.historyStore.deleteSession(sessionId);
      await this.sendHydrate();
      vscode.window.showInformationMessage(`Historico movido para ${this.openClaudePaths.deletedHistoryDir}.`);
    } catch (error) {
      this.showError(`Nao consegui apagar esse historico: ${error.message}`);
    }
  }

  setActiveSession(sessionId) {
    if (!sessionId || !this.sessions.has(sessionId)) {
      return;
    }

    this.activeSessionId = sessionId;
    this.postMessage({
      type: 'activeSessionChanged',
      activeSessionId: this.activeSessionId
    });
  }

  shortSessionId(sessionId) {
    return String(sessionId || '').slice(0, 8);
  }

  serializeSession(session) {
    return {
      id: session.id,
      openClaudeSessionId: session.openClaudeSessionId,
      title: session.title,
      cwd: session.cwd,
      profileId: session.profileId,
      profileName: session.profileName,
      model: session.model,
      messages: session.messages,
      status: session.status,
      streaming: session.streaming,
      closed: session.closed,
      pendingPermissions: session.pendingPermissions,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      permissionMode: session.permissionMode,
      thinkingEnabled: session.thinkingEnabled,
      mode: normalizeSessionMode(session.mode),
      modeSwitching: Boolean(session.modeSwitching),
      pendingMode: session.pendingMode,
      runtimeCapabilities: session.runtimeCapabilities,
      activeSkills: Array.isArray(session.activeSkills) ? session.activeSkills.slice() : [],
      viewer: Boolean(session.viewer),
      viewerSource: session.viewerSource,
      viewerSessionId: session.viewerSessionId
    };
  }

  async sendHydrate() {
    this.postMessage({
      type: 'hydrate',
      profiles: await this.profileStore.serializeProfiles(),
      activeProfileId: await this.profileStore.getActiveProfileId(),
      sessions: Array.from(this.sessions.values()).map((session) => this.serializeSession(session)),
      activeSessionId: this.activeSessionId,
      history: await this.historyStore.listRecentSessions(),
      cwd: getWorkspaceCwd()
    });
  }

  postSessionUpdated(session) {
    this.postMessage({
      type: 'sessionUpdated',
      session: this.serializeSession(session)
    });
  }

  postMessage(message) {
    if (this.view && this.webviewReady) {
      this.view.webview.postMessage(message);
    }
  }

  showError(text) {
    vscode.window.showErrorMessage(text);
    this.postMessage({ type: 'error', text });
  }

  dispose() {
    for (const session of this.sessions.values()) {
      try {
        session.process?.kill();
      } catch {
        // Ignore shutdown races.
      }
    }

    this.sessions.clear();
  }
}

module.exports = {
  OpenClaudeViewProvider
};

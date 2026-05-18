const assert = require('assert');
const { EventEmitter } = require('events');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const messages = [];
const quickPickQueue = [];
const openedDocs = [];
const terminals = [];
let spawnCalls = 0;
const spawnCommands = [];
const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaude-backend-'));

const mockVscode = {
  workspace: {
    workspaceFolders: [{ uri: { fsPath: tempWorkspace } }],
    async openTextDocument(uri) {
      openedDocs.push(uri.fsPath);
      return { uri };
    }
  },
  Uri: {
    file(fsPath) {
      return { fsPath };
    },
    joinPath(...parts) {
      return {
        fsPath: parts.map((part) => typeof part === 'string' ? part : part.fsPath).join('\\')
      };
    }
  },
  commands: {
    async executeCommand() {}
  },
  window: {
    async showQuickPick(items, options = {}) {
      const next = quickPickQueue.shift();
      if (!next) {
        return undefined;
      }

      assert.strictEqual(options.placeHolder, next.placeHolder);
      return next.pick(items);
    },
    async showWarningMessage() {
      return undefined;
    },
    async showInformationMessage() {
      return undefined;
    },
    async showInputBox() {
      return undefined;
    },
    async showOpenDialog() {
      return undefined;
    },
    async showTextDocument(doc) {
      openedDocs.push(doc.uri.fsPath);
    },
    showErrorMessage(message) {
      throw new Error(`Unexpected VS Code error: ${message}`);
    },
    createTerminal(options) {
      const terminal = {
        options,
        sent: [],
        shown: false,
        sendText(text) {
          this.sent.push(text);
        },
        show() {
          this.shown = true;
        }
      };
      terminals.push(terminal);
      return terminal;
    }
  }
};

function createFakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdout.setEncoding = () => {};
  proc.stderr.setEncoding = () => {};
  proc.stdin = {
    writes: [],
    write(line) {
      this.writes.push(line);
    }
  };
  proc.kill = () => {};
  return proc;
}

const childProcessMock = {
  spawn(command) {
    spawnCalls += 1;
    spawnCommands.push(command);
    return createFakeProcess();
  },
  exec(command, options, callback) {
    callback(null, '', '');
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return mockVscode;
  }
  if (request === 'child_process') {
    return childProcessMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { OpenClaudeViewProvider } = require('../src/openclaude-view-provider');

const profiles = [
  {
    id: 'p1',
    name: 'Perfil 1',
    provider: 'ollama',
    model: 'm1',
    baseUrl: 'http://localhost:11434/v1'
  },
  {
    id: 'p2',
    name: 'Perfil 2',
    provider: 'ollama',
    model: 'm2',
    baseUrl: 'http://localhost:11434/v1'
  }
];
let activeProfileId = 'p1';

const profileStore = {
  async serializeProfiles() {
    return profiles.map((profile) => ({
      ...profile,
      needsApiKey: false,
      hasApiKey: false
    }));
  },
  async getActiveProfileId() {
    return activeProfileId;
  },
  async getActiveProfile() {
    return profiles.find((profile) => profile.id === activeProfileId);
  },
  async setActiveProfileId(profileId) {
    activeProfileId = profileId;
  },
  async getSecret() {
    return '';
  }
};

const historyStore = {
  async listRecentSessions() {
    return [{ id: 'h1', title: 'Hist 1', updatedAt: '2026-05-16T00:00:00.000Z' }];
  },
  loadMessages() {
    return [];
  },
  listCodexSessions() {
    return [];
  },
  loadCodexMessages() {
    return [];
  }
};

const skillsStore = {
  userOpenClaudeDir: 'C:\\Users\\Leonardo\\.openclaude',
  listSkills() {
    return [{
      name: 'Skill 1',
      source: 'user',
      description: '',
      filePath: 'C:\\skill\\SKILL.md'
    }];
  },
  listAgents() {
    return [];
  }
};

const rufloActions = [];
const rufloService = {
  async getStatus() {
    return {
      installed: true,
      version: '3.7.0-alpha.42',
      mcpRegistered: true,
      memoryInitialized: true,
      memoryPath: path.join(tempWorkspace, '.swarm', 'memory.db'),
      daemonRunning: false,
      workspaceCwd: tempWorkspace,
      projectKey: tempWorkspace.replace(/\\/g, '/'),
      configPath: 'C:\\Users\\Leonardo\\.openclaude.json',
      daemonWorkersEnabled: '5',
      reason: 'daemonStopped'
    };
  },
  registerWorkspaceMcp() {
    rufloActions.push('registerMcp');
    return { ok: true, message: 'MCP registrado.' };
  },
  removeWorkspaceMcp() {
    rufloActions.push('removeMcp');
    return { ok: true, message: 'MCP removido.' };
  },
  async startDaemon() {
    rufloActions.push('startDaemon');
    return { ok: true, message: 'Daemon iniciado.' };
  },
  async stopDaemon() {
    rufloActions.push('stopDaemon');
    return { ok: true, message: 'Daemon parado.' };
  },
  async runDoctor() {
    rufloActions.push('doctor');
    return { ok: true, message: 'Doctor concluido.' };
  },
  async initializeMemory() {
    rufloActions.push('initMemory');
    return { ok: true, message: 'Memoria inicializada.' };
  },
  deleteMemory() {
    rufloActions.push('deleteMemory');
    return { ok: true, message: 'Memoria apagada.' };
  },
  async activateWorkspace() {
    rufloActions.push('activateAll');
    return { ok: true, message: 'Ruflo ativado.' };
  },
  async getToolCatalog() {
    return {
      ok: true,
      tools: [
        { name: 'guidance_recommend', category: 'uncategorized', enabled: true },
        { name: 'hooks_route', category: 'uncategorized', enabled: true },
        { name: 'swarm_init', category: 'swarm', enabled: true },
        { name: 'swarm_status', category: 'swarm', enabled: true },
        { name: 'swarm_health', category: 'swarm', enabled: true },
        { name: 'swarm_shutdown', category: 'swarm', enabled: true },
        { name: 'agent_spawn', category: 'agent', enabled: true },
        { name: 'agent_list', category: 'agent', enabled: true },
        { name: 'memory_search', category: 'memory', enabled: true },
        { name: 'memory_store', category: 'memory', enabled: true }
      ]
    };
  }
};

const pathCalls = [];
const openClaudePaths = {
  deletedHistoryDir: 'C:\\Users\\Leonardo\\.openclaude\\deleted-history',
  ensureUserState() {
    pathCalls.push('ensureUserState');
  },
  ensureProjectState(cwd) {
    pathCalls.push(`ensureProjectState:${cwd}`);
  },
  syncProjectLegacyBridge(cwd) {
    pathCalls.push(`syncProjectLegacyBridge:${cwd}`);
  }
};

async function run() {
  const provider = new OpenClaudeViewProvider(
    { extensionUri: { fsPath: 'C:\\ext' } },
    profileStore,
    historyStore,
    skillsStore,
    rufloService,
    openClaudePaths
  );
  provider.view = {
    webview: {
      postMessage(message) {
        messages.push(message);
      }
    }
  };
  provider.webviewReady = true;

  await provider.sendHydrate();
  assert.strictEqual(messages.at(-1).type, 'hydrate');
  assert.strictEqual(messages.at(-1).history.length, 1);
  assert.strictEqual(messages.at(-1).cwd, tempWorkspace);

  await provider.handleWebviewMessage({ command: 'selectProfile', profileId: 'p2' });
  assert.strictEqual(activeProfileId, 'p2');
  assert.strictEqual(messages.at(-1).activeProfileId, 'p2');

  await provider.handleWebviewMessage({ command: 'newChat' });
  assert.strictEqual(spawnCalls, 1);
  assert.strictEqual(messages.find((message) => message.type === 'sessionCreated')?.session.profileId, 'p2');
  assert(pathCalls.includes(`ensureProjectState:${tempWorkspace}`));
  assert(pathCalls.includes(`syncProjectLegacyBridge:${tempWorkspace}`));
  assert(spawnCommands[0].includes('--strict-mcp-config'));
  assert(spawnCommands[0].includes('--mcp-config'));

  await provider.openRufloCli();
  assert.strictEqual(terminals.length, 1);
  assert.strictEqual(terminals[0].sent[0], 'claude-flow doctor');
  assert.strictEqual(terminals[0].shown, true);

  quickPickQueue.push(
    {
      placeHolder: 'Gerenciar modelos do OpenClaude',
      pick: (items) => items.find((item) => item.action === 'select')
    },
    {
      placeHolder: 'Selecione o modelo/preset do OpenClaude',
      pick: (items) => items.find((item) => item.profile.id === 'p1')
    }
  );
  await provider.handleWebviewMessage({ command: 'manageProfiles' });
  assert.strictEqual(activeProfileId, 'p1');
  assert.strictEqual(messages.at(-1).activeProfileId, 'p1');

  await provider.handleWebviewMessage({ command: 'getRufloStatus', force: true });
  assert.strictEqual(messages.at(-1).type, 'rufloStatus');
  assert.strictEqual(messages.at(-1).status.reason, 'daemonStopped');

  await provider.handleWebviewMessage({ command: 'runRufloAction', action: 'registerMcp' });
  assert.strictEqual(rufloActions.at(-1), 'registerMcp');
  assert.strictEqual(messages.at(-2).type, 'rufloActionResult');
  assert.strictEqual(messages.at(-2).action, 'registerMcp');

  await provider.handleWebviewMessage({ command: 'runRufloAction', action: 'activateAll' });
  assert.strictEqual(rufloActions.at(-1), 'activateAll');
  assert.strictEqual(messages.at(-2).action, 'activateAll');

  await provider.handleWebviewMessage({ command: 'runRufloAction', action: 'deleteMemory' });
  assert.strictEqual(rufloActions.at(-1), 'deleteMemory');
  assert.strictEqual(messages.at(-2).action, 'deleteMemory');

  quickPickQueue.push(
    {
      placeHolder: 'Skills e agentes do OpenClaude',
      pick: (items) => items.find((item) => item.action === 'list-skills')
    },
    {
      placeHolder: 'Skills instaladas — selecione pra editar',
      pick: (items) => items[0]
    }
  );
  await provider.handleWebviewMessage({ command: 'manageSkills' });
  assert(openedDocs.includes('C:\\skill\\SKILL.md'));

  const localEnv = provider.buildEnv({
    provider: 'openai-compatible',
    model: 'm-local',
    baseUrl: 'http://localhost:1234/v1'
  }, '');
  assert.strictEqual(localEnv.OPENAI_API_KEY, 'local');

  const groqEnv = provider.buildEnv({
    provider: 'openai-compatible',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    baseUrl: 'https://api.groq.com/openai/v1'
  }, 'secret');
  assert.strictEqual(
    groqEnv.CLAUDE_CODE_OPENAI_CONTEXT_WINDOWS,
    JSON.stringify({ 'meta-llama/llama-4-scout-17b-16e-instruct': 131072 })
  );
  assert.strictEqual(
    groqEnv.CLAUDE_CODE_OPENAI_MAX_OUTPUT_TOKENS,
    JSON.stringify({ 'meta-llama/llama-4-scout-17b-16e-instruct': 8192 })
  );

  const session = provider.sessions.values().next().value;
  session.messages.push({
    id: 'u1',
    role: 'user',
    text: 'Contexto anterior',
    final: true,
    createdAt: '2026-05-16T00:00:00.000Z'
  });
  await provider.setSessionMode(session.id, 'swarm');
  assert.strictEqual(spawnCalls, 2);
  assert.strictEqual(session.mode, 'swarm');
  assert.strictEqual(session.modeSwitching, false);
  assert.strictEqual(session.runtimeCapabilities.rufloToolsSelected, 10);
  assert(spawnCommands[1].includes('--append-system-prompt-file'));

  provider.handleProcessStdout(
    session.id,
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } })}\n`
  );
  assert.strictEqual(session.messages.at(-1).text, 'ok');

  provider.handleSdkMessage(session, {
    type: 'user',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: [{ type: 'text', text: 'feito' }]
      }]
    }
  });

  console.log('backend smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
});

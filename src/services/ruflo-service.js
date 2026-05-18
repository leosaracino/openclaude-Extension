const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { OpenClaudePaths } = require('./openclaude-paths');

const execAsync = util.promisify(exec);
const CLI_BIN = 'claude-flow';

function nowIso() {
  return new Date().toISOString();
}

function trimString(value) {
  return String(value || '').trim();
}

class RufloService {
  constructor(options = {}) {
    this.execAsync = options.execAsync || execAsync;
    this.fs = options.fs || fs;
    this.path = options.path || path;
    this.home = options.home || process.env.USERPROFILE || os.homedir();
    this.paths = options.paths || new OpenClaudePaths({
      fs: this.fs,
      path: this.path,
      home: this.home
    });
    this.paths.ensureUserState();
    this.cache = new Map();
    this.toolCatalogCache = undefined;
  }

  getClaudeConfigPath() {
    return this.paths.userConfigPath;
  }

  getProbeEnv() {
    const env = { ...process.env };
    if (process.platform === 'win32' && process.env.APPDATA) {
      const globalNpm = this.path.join(process.env.APPDATA, 'npm');
      env.PATH = `${globalNpm};${process.env.PATH || ''}`;
    }
    return env;
  }

  normalizeProjectKey(value) {
    return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  }

  readClaudeConfig() {
    const configPath = this.getClaudeConfigPath();
    if (!this.fs.existsSync(configPath)) {
      return { configPath, config: { projects: {} }, exists: false };
    }

    const raw = this.fs.readFileSync(configPath, 'utf8');
    return {
      configPath,
      config: JSON.parse(raw),
      exists: true
    };
  }

  writeClaudeConfig(configPath, config) {
    this.fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  findProjectEntry(config, workspaceCwd) {
    const projects = config.projects && typeof config.projects === 'object' ? config.projects : {};
    const normalizedTarget = this.normalizeProjectKey(workspaceCwd).toLowerCase();
    const projectKey = Object.keys(projects).find(
      (key) => this.normalizeProjectKey(key).toLowerCase() === normalizedTarget
    );

    return {
      projects,
      projectKey,
      project: projectKey ? projects[projectKey] : undefined
    };
  }

  inspectMcpRegistration(workspaceCwd) {
    const { configPath, config } = this.readClaudeConfig();
    const { projectKey, project } = this.findProjectEntry(config, workspaceCwd);
    const mcpServers = project?.mcpServers && typeof project.mcpServers === 'object'
      ? project.mcpServers
      : {};
    const serverName = Object.keys(mcpServers).find((name) => /^(claude-flow|ruflo)$/i.test(name));

    return {
      configPath,
      projectKey: projectKey || this.normalizeProjectKey(workspaceCwd),
      registered: Boolean(serverName),
      serverName
    };
  }

  async runCommand(command, options = {}) {
    try {
      const { stdout, stderr } = await this.execAsync(command, {
        timeout: options.timeout || 15000,
        windowsHide: true,
        shell: true,
        cwd: options.cwd,
        env: options.env || this.getProbeEnv()
      });
      return {
        ok: true,
        stdout: trimString(stdout),
        stderr: trimString(stderr)
      };
    } catch (error) {
      return {
        ok: false,
        stdout: trimString(error?.stdout),
        stderr: trimString(error?.stderr),
        error: trimString(error?.message) || 'Falha ao executar comando.'
      };
    }
  }

  parseDaemonInfo(output) {
    const text = String(output || '');
    const statusLine = text.split(/\r?\n/).find((line) => /\bstatus\s*:/i.test(line)) || '';
    const pidLine = text.split(/\r?\n/).find((line) => /\bpid\s*:/i.test(line)) || '';
    const workersLine = text.split(/\r?\n/).find((line) => /\bworkers enabled\s*:/i.test(line)) || '';

    return {
      running: /\brunning\b/i.test(statusLine),
      pid: pidLine.match(/\bpid\s*:\s*(\d+)/i)?.[1],
      workersEnabled: workersLine.match(/\bworkers enabled\s*:\s*(\d+)/i)?.[1]
    };
  }

  inspectMemory(workspaceCwd) {
    const candidates = [
      this.path.join(workspaceCwd, '.swarm', 'memory.db'),
      this.path.join(workspaceCwd, '.claude-flow', 'memory.db'),
      this.path.join(workspaceCwd, '.claude', 'memory.db'),
      this.path.join(workspaceCwd, 'data', 'memory.db'),
      this.path.join(workspaceCwd, 'memory.db')
    ];
    const memoryPath = candidates.find((candidate) => this.fs.existsSync(candidate));

    return {
      initialized: Boolean(memoryPath),
      path: memoryPath || candidates[0]
    };
  }

  async getStatus({ workspaceCwd, force = false } = {}) {
    const cacheKey = this.normalizeProjectKey(workspaceCwd);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (!force && cached && now - cached.time < 30000) {
      return cached.value;
    }

    const versionResult = await this.runCommand(`${CLI_BIN} --version`, {
      timeout: 8000,
      cwd: workspaceCwd
    });
    const versionMatch = versionResult.stdout.match(/\d+\.\d+(?:\.\d+)?(?:[-+]\S+)?/);

    let mcpInfo = {
      registered: false,
      projectKey: this.normalizeProjectKey(workspaceCwd),
      configPath: this.getClaudeConfigPath()
    };
    let configError;
    try {
      mcpInfo = this.inspectMcpRegistration(workspaceCwd);
    } catch (error) {
      configError = trimString(error?.message) || 'Nao foi possivel ler o arquivo de configuracao do OpenClaude.';
    }

    const daemonResult = versionResult.ok
      ? await this.runCommand(`${CLI_BIN} daemon status`, {
          timeout: 10000,
          cwd: workspaceCwd
        })
      : { ok: false, stdout: '', stderr: '', error: '' };

    const daemonInfo = this.parseDaemonInfo(daemonResult.stdout);
    const memoryInfo = this.inspectMemory(workspaceCwd);
    const status = {
      installed: Boolean(versionMatch),
      version: versionMatch?.[0],
      mcpRegistered: Boolean(mcpInfo.registered),
      memoryInitialized: memoryInfo.initialized,
      memoryPath: memoryInfo.path,
      daemonRunning: daemonInfo.running,
      daemonPid: daemonInfo.pid,
      daemonWorkersEnabled: daemonInfo.workersEnabled,
      workspaceCwd,
      projectKey: mcpInfo.projectKey,
      configPath: mcpInfo.configPath,
      mcpServerName: mcpInfo.serverName,
      configError,
      cliError: versionResult.ok ? undefined : versionResult.stderr || versionResult.error || undefined,
      daemonError: daemonResult.ok ? undefined : daemonResult.stderr || daemonResult.error || undefined,
      checkedAt: nowIso()
    };

    if (!status.installed) {
      status.reason = 'cliMissing';
    } else if (status.configError) {
      status.reason = 'configError';
    } else if (!status.mcpRegistered) {
      status.reason = 'mcpMissing';
    } else if (!status.memoryInitialized) {
      status.reason = 'memoryMissing';
    } else if (!status.daemonRunning) {
      status.reason = 'daemonStopped';
    } else {
      status.reason = 'ready';
    }

    this.cache.set(cacheKey, { time: now, value: status });
    return status;
  }

  clearCache() {
    this.cache.clear();
  }

  async getToolCatalog({ force = false } = {}) {
    if (!force && this.toolCatalogCache) {
      return this.toolCatalogCache;
    }

    const result = await this.runCommand(`${CLI_BIN} mcp tools --format json`, {
      timeout: 30000
    });
    if (!result.ok) {
      return {
        ok: false,
        tools: [],
        error: result.stderr || result.error || 'Nao consegui listar as tools do Ruflo.'
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      const tools = Array.isArray(parsed) ? parsed : [];
      this.toolCatalogCache = {
        ok: true,
        tools
      };
      return this.toolCatalogCache;
    } catch (error) {
      return {
        ok: false,
        tools: [],
        error: trimString(error?.message) || 'O catalogo de tools do Ruflo veio em formato invalido.'
      };
    }
  }

  registerWorkspaceMcp(workspaceCwd) {
    const { configPath, config } = this.readClaudeConfig();
    if (!config.projects || typeof config.projects !== 'object') {
      config.projects = {};
    }

    const { projectKey } = this.findProjectEntry(config, workspaceCwd);
    const nextProjectKey = projectKey || this.normalizeProjectKey(workspaceCwd);
    const project = config.projects[nextProjectKey] || {};
    const mcpServers = project.mcpServers && typeof project.mcpServers === 'object'
      ? project.mcpServers
      : {};

    mcpServers['claude-flow'] = {
      type: 'stdio',
      command: 'claude-flow',
      args: ['mcp', 'start'],
      env: {}
    };
    project.mcpServers = mcpServers;
    config.projects[nextProjectKey] = project;

    this.writeClaudeConfig(configPath, config);
    this.clearCache();
    return {
      ok: true,
      message: 'MCP do Ruflo registrado neste projeto.',
      output: configPath
    };
  }

  removeWorkspaceMcp(workspaceCwd) {
    const { configPath, config } = this.readClaudeConfig();
    const { projectKey, project } = this.findProjectEntry(config, workspaceCwd);
    if (!projectKey || !project?.mcpServers) {
      return {
        ok: true,
        message: 'Este projeto ja estava sem MCP do Ruflo.',
        output: configPath
      };
    }

    delete project.mcpServers['claude-flow'];
    delete project.mcpServers.ruflo;
    config.projects[projectKey] = project;
    this.writeClaudeConfig(configPath, config);
    this.clearCache();
    return {
      ok: true,
      message: 'MCP do Ruflo removido deste projeto.',
      output: configPath
    };
  }

  async startDaemon(workspaceCwd) {
    const result = await this.runCommand(`${CLI_BIN} daemon start`, {
      timeout: 30000,
      cwd: workspaceCwd
    });
    this.clearCache();
    return {
      ...result,
      message: result.ok ? 'Daemon do Ruflo iniciado.' : 'Nao consegui iniciar o daemon do Ruflo.'
    };
  }

  async stopDaemon(workspaceCwd) {
    const result = await this.runCommand(`${CLI_BIN} daemon stop`, {
      timeout: 30000,
      cwd: workspaceCwd
    });
    this.clearCache();
    return {
      ...result,
      message: result.ok ? 'Daemon do Ruflo parado.' : 'Nao consegui parar o daemon do Ruflo.'
    };
  }

  async runDoctor(workspaceCwd) {
    const result = await this.runCommand(`${CLI_BIN} doctor`, {
      timeout: 30000,
      cwd: workspaceCwd
    });
    return {
      ...result,
      message: result.ok ? 'Diagnostico do Ruflo concluido.' : 'O diagnostico do Ruflo falhou.'
    };
  }

  async initializeMemory(workspaceCwd) {
    const memoryInfo = this.inspectMemory(workspaceCwd);
    if (memoryInfo.initialized) {
      return {
        ok: true,
        skipped: true,
        message: 'A memoria do Ruflo ja estava inicializada.',
        output: memoryInfo.path
      };
    }

    const result = await this.runCommand(`${CLI_BIN} memory init`, {
      timeout: 30000,
      cwd: workspaceCwd
    });
    this.clearCache();
    return {
      ...result,
      message: result.ok ? 'Memoria do Ruflo inicializada.' : 'Nao consegui inicializar a memoria do Ruflo.'
    };
  }

  deleteMemory(workspaceCwd) {
    const memoryInfo = this.inspectMemory(workspaceCwd);
    if (!memoryInfo.initialized) {
      return {
        ok: true,
        skipped: true,
        message: 'Este projeto ja estava sem memoria do Ruflo.',
        output: memoryInfo.path
      };
    }

    const workspacePath = this.path.resolve(workspaceCwd);
    const memoryPath = this.path.resolve(memoryInfo.path);
    const workspacePrefix = `${workspacePath}${this.path.sep}`.toLowerCase();
    const normalizedMemoryPath = memoryPath.toLowerCase();
    if (!normalizedMemoryPath.startsWith(workspacePrefix)) {
      return {
        ok: false,
        message: 'Nao apaguei a memoria porque o arquivo ficou fora do projeto atual.',
        output: memoryPath
      };
    }

    const relatedFiles = [memoryPath, `${memoryPath}-wal`, `${memoryPath}-shm`];
    for (const filePath of relatedFiles) {
      if (this.fs.existsSync(filePath)) {
        this.fs.rmSync(filePath, { force: true });
      }
    }

    this.clearCache();
    return {
      ok: true,
      message: 'Memoria do Ruflo apagada neste projeto.',
      output: memoryPath
    };
  }

  async activateWorkspace(workspaceCwd) {
    const steps = [];
    let status = await this.getStatus({ workspaceCwd, force: true });
    if (!status.installed) {
      return {
        ok: false,
        message: 'O Ruflo ainda nao esta instalado nesta maquina.',
        steps
      };
    }

    if (!status.mcpRegistered) {
      steps.push(this.registerWorkspaceMcp(workspaceCwd));
    }

    status = await this.getStatus({ workspaceCwd, force: true });
    if (!status.memoryInitialized) {
      steps.push(await this.initializeMemory(workspaceCwd));
    }

    status = await this.getStatus({ workspaceCwd, force: true });
    if (!status.daemonRunning) {
      steps.push(await this.startDaemon(workspaceCwd));
    }

    this.clearCache();
    const failedStep = steps.find((step) => step && step.ok === false);
    return {
      ok: !failedStep,
      message: failedStep ? 'Nao consegui ativar o Ruflo por completo.' : 'Ruflo ativado neste projeto.',
      steps
    };
  }
}

module.exports = {
  RufloService
};

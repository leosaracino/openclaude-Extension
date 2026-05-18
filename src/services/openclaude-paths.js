const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_MARKDOWN_SUBDIRS = [
  'commands',
  'agents',
  'output-styles',
  'skills',
  'workflows'
];

class OpenClaudePaths {
  constructor(options = {}) {
    this.fs = options.fs || fs;
    this.path = options.path || path;
    this.home = options.home || process.env.USERPROFILE || os.homedir();
    this.workspaceCwdProvider = options.workspaceCwdProvider || (() => undefined);
  }

  get userDir() {
    return this.path.join(this.home, '.openclaude');
  }

  get legacyUserDir() {
    return this.path.join(this.home, '.claude');
  }

  get userConfigPath() {
    return this.path.join(this.home, '.openclaude.json');
  }

  get legacyUserConfigPath() {
    return this.path.join(this.home, '.claude.json');
  }

  get userSkillsDir() {
    return this.path.join(this.userDir, 'skills');
  }

  get userAgentsDir() {
    return this.path.join(this.userDir, 'agents');
  }

  get projectsDir() {
    return this.path.join(this.userDir, 'projects');
  }

  get legacyProjectsDir() {
    return this.path.join(this.legacyUserDir, 'projects');
  }

  get deletedHistoryDir() {
    return this.path.join(this.userDir, 'deleted-history');
  }

  get legacyDeletedHistoryDir() {
    return this.path.join(this.legacyUserDir, 'deleted-history');
  }

  getProjectDir(workspaceCwd = this.workspaceCwdProvider()) {
    return workspaceCwd ? this.path.join(workspaceCwd, '.openclaude') : undefined;
  }

  getLegacyProjectDir(workspaceCwd = this.workspaceCwdProvider()) {
    return workspaceCwd ? this.path.join(workspaceCwd, '.claude') : undefined;
  }

  ensureUserState() {
    this.fs.mkdirSync(this.userDir, { recursive: true });
    this.mergeDirectoryMissing(this.path.join(this.legacyUserDir, 'skills'), this.userSkillsDir);
    this.mergeDirectoryMissing(this.path.join(this.legacyUserDir, 'agents'), this.userAgentsDir);
    this.mergeDirectoryMissing(this.legacyProjectsDir, this.projectsDir);
    this.mergeDirectoryMissing(this.legacyDeletedHistoryDir, this.deletedHistoryDir);
    this.mergeGlobalConfig();
  }

  ensureProjectState(workspaceCwd = this.workspaceCwdProvider()) {
    const projectDir = this.getProjectDir(workspaceCwd);
    const legacyProjectDir = this.getLegacyProjectDir(workspaceCwd);
    if (!projectDir || !legacyProjectDir) {
      return;
    }

    this.fs.mkdirSync(projectDir, { recursive: true });
    for (const subdir of PROJECT_MARKDOWN_SUBDIRS) {
      this.mergeDirectoryMissing(
        this.path.join(legacyProjectDir, subdir),
        this.path.join(projectDir, subdir)
      );
    }
    this.copyFileIfMissing(
      this.path.join(legacyProjectDir, 'settings.json'),
      this.path.join(projectDir, 'settings.json')
    );
    this.copyFileIfMissing(
      this.path.join(legacyProjectDir, 'settings.local.json'),
      this.path.join(projectDir, 'settings.local.json')
    );
  }

  // OpenClaude 0.8.0 already uses ~/.openclaude and .openclaude/settings.json,
  // but its project markdown loader still scans .claude/{skills,agents,...}.
  // Keep .openclaude canonical and materialize a compatibility mirror only for
  // the legacy project loader until upstream accepts .openclaude there too.
  syncProjectLegacyBridge(workspaceCwd = this.workspaceCwdProvider()) {
    const projectDir = this.getProjectDir(workspaceCwd);
    const legacyProjectDir = this.getLegacyProjectDir(workspaceCwd);
    if (!projectDir || !legacyProjectDir) {
      return;
    }

    for (const subdir of PROJECT_MARKDOWN_SUBDIRS) {
      this.copyDirectoryOverwrite(
        this.path.join(projectDir, subdir),
        this.path.join(legacyProjectDir, subdir)
      );
    }
  }

  mergeGlobalConfig() {
    if (!this.fs.existsSync(this.legacyUserConfigPath)) {
      return;
    }

    if (!this.fs.existsSync(this.userConfigPath)) {
      this.fs.copyFileSync(this.legacyUserConfigPath, this.userConfigPath);
      return;
    }

    const legacy = this.readJsonFile(this.legacyUserConfigPath);
    const current = this.readJsonFile(this.userConfigPath);
    if (!legacy || !current) {
      return;
    }

    const merged = this.mergeMissingValues(legacy, current);
    this.fs.writeFileSync(this.userConfigPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  }

  mergeMissingValues(source, target) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return target;
    }

    const next = target && typeof target === 'object' && !Array.isArray(target)
      ? { ...target }
      : {};

    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = next[key];
      if (targetValue === undefined) {
        next[key] = sourceValue;
      } else if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        next[key] = this.mergeMissingValues(sourceValue, targetValue);
      }
    }

    return next;
  }

  readJsonFile(filePath) {
    try {
      return JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
    } catch {
      return undefined;
    }
  }

  mergeDirectoryMissing(sourceDir, targetDir) {
    if (!this.fs.existsSync(sourceDir)) {
      return;
    }

    this.fs.mkdirSync(targetDir, { recursive: true });
    const entries = this.fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = this.path.join(sourceDir, entry.name);
      const targetPath = this.path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        this.mergeDirectoryMissing(sourcePath, targetPath);
      } else if (entry.isFile() && !this.fs.existsSync(targetPath)) {
        this.fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  copyDirectoryOverwrite(sourceDir, targetDir) {
    if (!this.fs.existsSync(sourceDir)) {
      return;
    }

    this.fs.mkdirSync(targetDir, { recursive: true });
    const entries = this.fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = this.path.join(sourceDir, entry.name);
      const targetPath = this.path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectoryOverwrite(sourcePath, targetPath);
      } else if (entry.isFile()) {
        this.fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  copyFileIfMissing(sourcePath, targetPath) {
    if (!this.fs.existsSync(sourcePath) || this.fs.existsSync(targetPath)) {
      return;
    }

    this.fs.mkdirSync(this.path.dirname(targetPath), { recursive: true });
    this.fs.copyFileSync(sourcePath, targetPath);
  }
}

module.exports = {
  OpenClaudePaths,
  PROJECT_MARKDOWN_SUBDIRS
};

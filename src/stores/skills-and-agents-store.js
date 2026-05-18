const fs = require('fs');
const path = require('path');
const os = require('os');

const { getWorkspaceCwd } = require('../utils');
const { OpenClaudePaths } = require('../services/openclaude-paths');

class SkillsAndAgentsStore {
  constructor(options = {}) {
    this.home = options.home || process.env.USERPROFILE || os.homedir();
    this.workspaceCwdProvider = options.workspaceCwdProvider || getWorkspaceCwd;
    this.paths = options.paths || new OpenClaudePaths({
      home: this.home,
      workspaceCwdProvider: this.workspaceCwdProvider
    });
    this.paths.ensureUserState();
    this.userOpenClaudeDir = this.paths.userDir;
  }

  getProjectOpenClaudeDir() {
    const cwd = this.workspaceCwdProvider();
    this.paths.ensureProjectState(cwd);
    return this.paths.getProjectDir(cwd);
  }

  parseFrontmatter(content) {
    const text = String(content || '');
    if (!text.startsWith('---')) {
      return { frontmatter: {}, body: text };
    }
    const endIdx = text.indexOf('\n---', 3);
    if (endIdx === -1) {
      return { frontmatter: {}, body: text };
    }
    const fmText = text.slice(3, endIdx).trim();
    const body = text.slice(endIdx + 4).replace(/^\r?\n/, '');
    const frontmatter = {};
    for (const line of fmText.split(/\r?\n/)) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[match[1]] = value;
    }
    return { frontmatter, body };
  }

  listSkills() {
    const records = [];
    const seenIds = new Set();

    const dirs = [
      { path: path.join(this.userOpenClaudeDir, 'skills'), source: 'user' }
    ];
    const projectDir = this.getProjectOpenClaudeDir();
    if (projectDir) {
      dirs.push({ path: path.join(projectDir, 'skills'), source: 'project' });
    }

    for (const { path: skillsDir, source } of dirs) {
      if (!fs.existsSync(skillsDir)) continue;
      let entries;
      try {
        entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;

        const id = `${source}:${entry.name}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        try {
          const raw = fs.readFileSync(skillMdPath, 'utf8');
          const { frontmatter } = this.parseFrontmatter(raw);
          records.push({
            id,
            name: frontmatter.name || entry.name,
            description: frontmatter.description || '',
            source,
            filePath: skillMdPath,
            folderPath: path.join(skillsDir, entry.name)
          });
        } catch {
          records.push({
            id,
            name: entry.name,
            description: '(falha ao ler SKILL.md)',
            source,
            filePath: skillMdPath,
            folderPath: path.join(skillsDir, entry.name)
          });
        }
      }
    }

    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Skills "library" — kept in ~/.openclaude/skills.library/, NOT auto-loaded
  // by the CLI (which only reads ~/.openclaude/skills/). Used by the
  // extension's per-session "+ Skills" picker so the user can opt-in skills
  // one chat at a time instead of running with the whole catalogue always-on.
  listLibrarySkills() {
    const records = [];
    const libraryDir = path.join(this.userOpenClaudeDir, 'skills.library');
    if (!fs.existsSync(libraryDir)) {
      return records;
    }
    let entries;
    try {
      entries = fs.readdirSync(libraryDir, { withFileTypes: true });
    } catch {
      return records;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = path.join(libraryDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;
      try {
        const raw = fs.readFileSync(skillMdPath, 'utf8');
        const { frontmatter } = this.parseFrontmatter(raw);
        records.push({
          id: entry.name,
          name: frontmatter.name || entry.name,
          description: frontmatter.description || '',
          compatibility: frontmatter.compatibility || '',
          filePath: skillMdPath,
          folderPath: path.join(libraryDir, entry.name)
        });
      } catch {
        records.push({
          id: entry.name,
          name: entry.name,
          description: '(falha ao ler SKILL.md)',
          filePath: skillMdPath,
          folderPath: path.join(libraryDir, entry.name)
        });
      }
    }
    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Reads the full SKILL.md (frontmatter + body) for a library skill. Used by
  // sendUserMessage to inject the skill body into the prompt when the user has
  // it active on a session. Returns null when the skill doesn't exist.
  loadSkillContent(skillId) {
    if (!skillId || typeof skillId !== 'string') return null;
    // Defensive: only allow safe id characters so a bogus skillId can't escape
    // ~/.openclaude/skills.library/ via "../" segments.
    if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) return null;
    const skillMdPath = path.join(this.userOpenClaudeDir, 'skills.library', skillId, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) return null;
    try {
      const raw = fs.readFileSync(skillMdPath, 'utf8');
      const { frontmatter, body } = this.parseFrontmatter(raw);
      return { id: skillId, frontmatter, body, raw };
    } catch {
      return null;
    }
  }

  listAgents() {
    const records = [];
    const seenIds = new Set();

    const dirs = [
      { path: path.join(this.userOpenClaudeDir, 'agents'), source: 'user' }
    ];
    const projectDir = this.getProjectOpenClaudeDir();
    if (projectDir) {
      dirs.push({ path: path.join(projectDir, 'agents'), source: 'project' });
    }

    for (const { path: agentsDir, source } of dirs) {
      if (!fs.existsSync(agentsDir)) continue;
      let entries;
      try {
        entries = fs.readdirSync(agentsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const filePath = path.join(agentsDir, entry.name);
        const baseName = entry.name.slice(0, -3);
        const id = `${source}:${baseName}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const { frontmatter } = this.parseFrontmatter(raw);
          records.push({
            id,
            name: frontmatter.name || baseName,
            description: frontmatter.description || '',
            model: frontmatter.model || '',
            tools: frontmatter.tools || '',
            permissionMode: frontmatter.permissionMode || '',
            source,
            filePath
          });
        } catch {
          records.push({
            id,
            name: baseName,
            description: '(falha ao ler arquivo)',
            source,
            filePath
          });
        }
      }
    }

    return records.sort((a, b) => a.name.localeCompare(b.name));
  }

  createSkill({ name, description, scope = 'user' }) {
    const cleanName = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!cleanName) {
      throw new Error('Nome de skill inválido.');
    }

    const baseDir = scope === 'project' ? this.getProjectOpenClaudeDir() : this.userOpenClaudeDir;
    if (!baseDir) {
      throw new Error('Não há workspace aberto para skill de projeto.');
    }
    const skillsDir = path.join(baseDir, 'skills');
    const skillFolder = path.join(skillsDir, cleanName);
    fs.mkdirSync(skillFolder, { recursive: true });

    const skillMdPath = path.join(skillFolder, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${cleanName}" já existe em ${skillFolder}.`);
    }

    const safeName = cleanName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const safeDescription = String(description || '').replace(/"/g, '\\"');
    const template = `---
name: ${safeName}
description: ${safeDescription || 'Descreva o que essa skill faz e quando usá-la.'}
---

# ${safeName}

Substitua este conteúdo pelas instruções da skill. Quando o agente
detectar que esta skill é relevante para a tarefa, ele vai ler o conteúdo
abaixo como parte do contexto.

## Quando usar

(Descreva os triggers para esta skill.)

## Como usar

(Descreva o passo a passo ou as dicas que o agente deve seguir.)
`;
    fs.writeFileSync(skillMdPath, template, 'utf8');
    if (scope === 'project') {
      this.paths.syncProjectLegacyBridge(this.workspaceCwdProvider());
    }
    return { folderPath: skillFolder, filePath: skillMdPath };
  }

  createAgent({ name, description, prompt, model = '', scope = 'user' }) {
    const cleanName = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!cleanName) {
      throw new Error('Nome de agente inválido.');
    }

    const baseDir = scope === 'project' ? this.getProjectOpenClaudeDir() : this.userOpenClaudeDir;
    if (!baseDir) {
      throw new Error('Não há workspace aberto para agente de projeto.');
    }
    const agentsDir = path.join(baseDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const agentPath = path.join(agentsDir, `${cleanName}.md`);
    if (fs.existsSync(agentPath)) {
      throw new Error(`Agente "${cleanName}" já existe em ${agentPath}.`);
    }

    const safeDescription = String(description || '').replace(/"/g, '\\"');
    const safeModel = String(model || '').trim();
    const template = `---
name: ${cleanName}
description: ${safeDescription || 'Descreva o que esse agente faz.'}
${safeModel ? `model: ${safeModel}\n` : ''}---

${prompt || `Você é um agente especializado. Substitua este texto pelas instruções
do sistema que vão guiar o comportamento deste agente quando ele for
chamado pela ferramenta Task.`}
`;
    fs.writeFileSync(agentPath, template, 'utf8');
    if (scope === 'project') {
      this.paths.syncProjectLegacyBridge(this.workspaceCwdProvider());
    }
    return { filePath: agentPath };
  }

  importSkill(sourceFolder, scope = 'user') {
    if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) {
      throw new Error('Pasta de origem não existe ou não é um diretório.');
    }
    const skillMdPath = path.join(sourceFolder, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      throw new Error('Pasta não contém SKILL.md.');
    }

    const baseDir = scope === 'project' ? this.getProjectOpenClaudeDir() : this.userOpenClaudeDir;
    if (!baseDir) {
      throw new Error('Não há workspace aberto para skill de projeto.');
    }
    const skillsDir = path.join(baseDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const folderName = path.basename(sourceFolder);
    const targetFolder = path.join(skillsDir, folderName);
    if (fs.existsSync(targetFolder)) {
      throw new Error(`Já existe uma skill chamada "${folderName}" em ${skillsDir}.`);
    }

    this.copyDirectoryRecursive(sourceFolder, targetFolder);
    if (scope === 'project') {
      this.paths.syncProjectLegacyBridge(this.workspaceCwdProvider());
    }
    return { folderPath: targetFolder };
  }

  copyDirectoryRecursive(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, dstPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

module.exports = {
  SkillsAndAgentsStore
};

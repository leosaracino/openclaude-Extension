const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        workspaceFolders: []
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { OpenClaudePaths } = require('../src/services/openclaude-paths');
const { SkillsAndAgentsStore } = require('../src/stores/skills-and-agents-store');
const { HistoryStore } = require('../src/stores/history-store');
const { RufloService } = require('../src/services/ruflo-service');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

async function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaude-paths-'));
  const workspaceCwd = path.join(tempHome, 'workspace-demo');
  fs.mkdirSync(workspaceCwd, { recursive: true });

  writeFile(
    path.join(tempHome, '.claude', 'skills', 'legacy-skill', 'SKILL.md'),
    '---\nname: Legacy Skill\ndescription: from legacy\n---\n'
  );
  writeFile(
    path.join(tempHome, '.claude', 'agents', 'legacy-agent.md'),
    '---\nname: legacy-agent\ndescription: legacy agent\n---\n'
  );
  writeFile(
    path.join(tempHome, '.claude', 'projects', 'workspace-demo', 'session-1.jsonl'),
    '{"type":"user","message":{"content":"oi"}}\n'
  );
  writeFile(
    path.join(tempHome, '.claude', 'deleted-history', 'old-session.jsonl'),
    '{"type":"user","message":{"content":"old"}}\n'
  );
  writeFile(
    path.join(tempHome, '.claude.json'),
    JSON.stringify({
      legacyOnly: true,
      projects: {
        [workspaceCwd.replace(/\\/g, '/')]: {
          mcpServers: {
            legacy: { type: 'stdio' }
          }
        }
      }
    }, null, 2)
  );
  writeFile(
    path.join(tempHome, '.openclaude.json'),
    JSON.stringify({
      currentOnly: true,
      projects: {
        [workspaceCwd.replace(/\\/g, '/')]: {
          currentSetting: true
        }
      }
    }, null, 2)
  );

  writeFile(
    path.join(workspaceCwd, '.claude', 'skills', 'project-legacy', 'SKILL.md'),
    '---\nname: Project Legacy\ndescription: project skill\n---\n'
  );
  writeFile(
    path.join(workspaceCwd, '.claude', 'agents', 'project-legacy.md'),
    '---\nname: project-legacy\ndescription: project agent\n---\n'
  );
  writeFile(
    path.join(workspaceCwd, '.claude', 'settings.json'),
    '{"legacyProjectSetting":true}\n'
  );

  try {
    const openClaudePaths = new OpenClaudePaths({
      home: tempHome,
      workspaceCwdProvider: () => workspaceCwd
    });
    openClaudePaths.ensureUserState();
    openClaudePaths.ensureProjectState();

    assert.strictEqual(fs.existsSync(path.join(tempHome, '.openclaude', 'skills', 'legacy-skill', 'SKILL.md')), true);
    assert.strictEqual(fs.existsSync(path.join(tempHome, '.openclaude', 'agents', 'legacy-agent.md')), true);
    assert.strictEqual(fs.existsSync(path.join(tempHome, '.openclaude', 'projects', 'workspace-demo', 'session-1.jsonl')), true);
    assert.strictEqual(fs.existsSync(path.join(tempHome, '.openclaude', 'deleted-history', 'old-session.jsonl')), true);
    assert.strictEqual(fs.existsSync(path.join(workspaceCwd, '.openclaude', 'skills', 'project-legacy', 'SKILL.md')), true);
    assert.strictEqual(fs.existsSync(path.join(workspaceCwd, '.openclaude', 'agents', 'project-legacy.md')), true);
    assert.strictEqual(fs.existsSync(path.join(workspaceCwd, '.openclaude', 'settings.json')), true);

    const mergedConfig = JSON.parse(fs.readFileSync(path.join(tempHome, '.openclaude.json'), 'utf8'));
    assert.strictEqual(mergedConfig.currentOnly, true);
    assert.strictEqual(mergedConfig.legacyOnly, true);
    assert.strictEqual(mergedConfig.projects[workspaceCwd.replace(/\\/g, '/')].currentSetting, true);
    assert.deepStrictEqual(
      mergedConfig.projects[workspaceCwd.replace(/\\/g, '/')].mcpServers.legacy,
      { type: 'stdio' }
    );

    const skillsStore = new SkillsAndAgentsStore({
      home: tempHome,
      paths: openClaudePaths,
      workspaceCwdProvider: () => workspaceCwd
    });
    const skills = skillsStore.listSkills();
    const agents = skillsStore.listAgents();
    assert.deepStrictEqual(skills.map((item) => item.name).sort(), ['Legacy Skill', 'Project Legacy']);
    assert.deepStrictEqual(agents.map((item) => item.name).sort(), ['legacy-agent', 'project-legacy']);

    const createdSkill = skillsStore.createSkill({
      name: 'new-project-skill',
      description: 'new skill',
      scope: 'project'
    });
    assert(createdSkill.filePath.includes(`${path.sep}.openclaude${path.sep}`));
    assert.strictEqual(
      fs.existsSync(path.join(workspaceCwd, '.claude', 'skills', 'new-project-skill', 'SKILL.md')),
      true
    );

    const createdAgent = skillsStore.createAgent({
      name: 'new-project-agent',
      description: 'new agent',
      prompt: 'prompt',
      scope: 'project'
    });
    assert(createdAgent.filePath.includes(`${path.sep}.openclaude${path.sep}`));
    assert.strictEqual(
      fs.existsSync(path.join(workspaceCwd, '.claude', 'agents', 'new-project-agent.md')),
      true
    );

    const historyStore = new HistoryStore({ home: tempHome, paths: openClaudePaths });
    const sessions = await historyStore.listRecentSessions();
    assert.strictEqual(sessions.filter((session) => session.id === 'session-1').length, 1);
    const deletedPath = historyStore.deleteSession('session-1');
    assert(deletedPath.includes(`${path.sep}.openclaude${path.sep}deleted-history${path.sep}`));
    assert.strictEqual(historyStore.findSessionFiles('session-1').length, 0);

    const rufloService = new RufloService({
      home: tempHome,
      paths: openClaudePaths,
      execAsync: async (command) => {
        if (command === 'claude-flow --version') {
          return { stdout: 'ruflo v3.7.0-alpha.42', stderr: '' };
        }
        if (command === 'claude-flow daemon status') {
          return { stdout: '| Status: ○ STOPPED |', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command}`);
      }
    });
    assert.strictEqual(rufloService.getClaudeConfigPath(), path.join(tempHome, '.openclaude.json'));
    const registerResult = rufloService.registerWorkspaceMcp(workspaceCwd);
    assert.strictEqual(registerResult.ok, true);
    const configAfterRuflo = JSON.parse(fs.readFileSync(path.join(tempHome, '.openclaude.json'), 'utf8'));
    assert(configAfterRuflo.projects[workspaceCwd.replace(/\\/g, '/')].mcpServers['claude-flow']);

    console.log('openclaude paths smoke passed');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

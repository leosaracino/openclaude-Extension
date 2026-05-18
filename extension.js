const vscode = require('vscode');

const { ProfileStore } = require('./src/stores/profile-store');
const { SkillsAndAgentsStore } = require('./src/stores/skills-and-agents-store');
const { HistoryStore } = require('./src/stores/history-store');
const { selectProfile, manageProfiles } = require('./src/commands');
const { OpenClaudeViewProvider } = require('./src/openclaude-view-provider');
const { RufloService } = require('./src/services/ruflo-service');
const { OpenClaudePaths } = require('./src/services/openclaude-paths');
const { getWorkspaceCwd } = require('./src/utils');

function activate(context) {
  const openClaudePaths = new OpenClaudePaths({
    workspaceCwdProvider: getWorkspaceCwd
  });
  openClaudePaths.ensureUserState();
  const profileStore = new ProfileStore(context);
  const historyStore = new HistoryStore({ paths: openClaudePaths });
  const skillsStore = new SkillsAndAgentsStore({ paths: openClaudePaths });
  const rufloService = new RufloService({ paths: openClaudePaths });
  const openClaudeViewProvider = new OpenClaudeViewProvider(
    context,
    profileStore,
    historyStore,
    skillsStore,
    rufloService,
    openClaudePaths
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leonardo.openClaude', () => openClaudeViewProvider.show()),
    vscode.commands.registerCommand('leonardo.newOpenClaudeChat', () => openClaudeViewProvider.showAndCreateSession()),
    vscode.commands.registerCommand('leonardo.closeOpenClaudeChat', () => openClaudeViewProvider.closeActiveSession()),
    vscode.commands.registerCommand('leonardo.manageOpenClaudeModels', async () => {
      await manageProfiles(profileStore);
      await openClaudeViewProvider.sendHydrate();
    }),
    vscode.commands.registerCommand('leonardo.selectOpenClaudeModel', async () => {
      await selectProfile(profileStore);
      await openClaudeViewProvider.sendHydrate();
    }),
    vscode.commands.registerCommand('leonardo.resumeOpenClaudeSession', () => openClaudeViewProvider.resumeSessionFromPicker()),
    vscode.commands.registerCommand('leonardo.openRufloCli', () => openClaudeViewProvider.openRufloCli()),
    vscode.window.registerWebviewViewProvider('leonardo.openClaudeView', openClaudeViewProvider),
    openClaudeViewProvider
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

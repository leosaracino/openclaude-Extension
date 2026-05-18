const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const {
  createId,
  nowIso,
  getSecretId,
  profileNeedsApiKey
} = require('./utils');

async function selectProfile(profileStore) {
  const profiles = await profileStore.serializeProfiles();
  const picked = await vscode.window.showQuickPick(profiles.map((profile) => ({
    label: profile.name,
    description: `${profile.provider} - ${profile.model}`,
    detail: profile.needsApiKey && !profile.hasApiKey ? 'API key pendente' : profile.baseUrl || '',
    profile
  })), {
    placeHolder: 'Selecione o modelo/preset do OpenClaude'
  });

  if (picked) {
    await profileStore.setActiveProfileId(picked.profile.id);
  }
}

async function manageProfiles(profileStore) {
  const activeProfile = await profileStore.getActiveProfile();
  let keyLabel = 'Cadastrar/alterar API key';
  let keyDetail;
  if (activeProfile && profileNeedsApiKey(activeProfile)) {
    const hasKey = Boolean(await profileStore.getSecret(activeProfile));
    if (hasKey) {
      keyLabel = `Alterar API key de "${activeProfile.name}"`;
      keyDetail = 'Chave já cadastrada — substitui pela nova';
    } else {
      keyLabel = `Cadastrar API key de "${activeProfile.name}"`;
      keyDetail = 'Sem chave cadastrada ainda';
    }
  }

  const action = await vscode.window.showQuickPick([
    { label: 'Cadastrar modelo novo', action: 'add' },
    { label: 'Selecionar modelo ativo', action: 'select' },
    { label: 'Editar modelo ativo', action: 'edit' },
    { label: keyLabel, detail: keyDetail, action: 'key' },
    { label: 'Excluir modelo ativo', action: 'delete' }
  ], {
    placeHolder: 'Gerenciar modelos do OpenClaude'
  });

  if (!action) {
    return;
  }

  if (action.action === 'select') {
    await selectProfile(profileStore);
    return;
  }

  if (action.action === 'add') {
    await editProfile(profileStore);
  } else if (action.action === 'edit') {
    await editProfile(profileStore, activeProfile);
  } else if (action.action === 'key') {
    await configureProfileApiKey(profileStore, activeProfile);
  } else if (action.action === 'delete') {
    const confirm = await vscode.window.showWarningMessage(
      `Excluir o modelo "${activeProfile.name}"?`,
      { modal: true },
      'Excluir'
    );

    if (confirm === 'Excluir') {
      await profileStore.deleteProfile(activeProfile.id);
    }
  }
}

async function editProfile(profileStore, existing) {
  const providerItems = [
    { label: 'OpenAI-compatible', value: 'openai-compatible', description: 'OpenAI, OpenRouter, DeepSeek, Groq, LM Studio remoto' },
    { label: 'Ollama/local', value: 'ollama', description: 'Endpoint local sem chave obrigatoria' },
    { label: 'Google Gemini', value: 'gemini', description: 'GEMINI_API_KEY + GEMINI_MODEL' },
    { label: 'Mistral', value: 'mistral', description: 'MISTRAL_API_KEY + MISTRAL_MODEL' },
    { label: 'Codex', value: 'codex', description: 'Codex auth existente ou CODEX_API_KEY' }
  ];

  const providerPick = await vscode.window.showQuickPick(providerItems, {
    placeHolder: 'Qual provider esse modelo usa?'
  });

  if (!providerPick && !existing) {
    return;
  }

  const provider = providerPick?.value || existing.provider;
  const name = await vscode.window.showInputBox({
    title: existing ? 'Editar nome do modelo' : 'Nome do modelo',
    prompt: 'Ex: OpenRouter GPT-4o, Gemini Flash, Ollama Qwen',
    value: existing?.name || ''
  });

  if (!name) {
    return;
  }

  const model = await vscode.window.showInputBox({
    title: 'ID do modelo',
    prompt: 'Ex: gpt-4o, gemini-3-flash-preview, qwen2.5-coder:7b',
    value: existing?.model || defaultModelForProvider(provider)
  });

  if (!model) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: 'Endpoint/base URL',
    prompt: 'Opcional para alguns providers. Use /v1 para OpenAI-compatible.',
    value: existing?.baseUrl || defaultBaseUrlForProvider(provider)
  });

  const stamp = nowIso();
  const profileId = existing?.id || createId('profile');
  const profile = {
    id: profileId,
    name,
    provider,
    model,
    baseUrl: baseUrl || undefined,
    apiFormat: existing?.apiFormat,
    apiKeySecretId: existing?.apiKeySecretId || (provider === 'ollama' ? undefined : getSecretId(profileId)),
    extraEnv: existing?.extraEnv || {},
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp
  };

  if (!profile.apiKeySecretId && profileNeedsApiKey(profile)) {
    profile.apiKeySecretId = getSecretId(profile.id);
  }

  await profileStore.upsertProfile(profile);
  await profileStore.setActiveProfileId(profile.id);

  if (profileNeedsApiKey(profile)) {
    const hasExistingKey = Boolean(await profileStore.getSecret(profile));
    if (!hasExistingKey) {
      const shouldSetKey = await vscode.window.showInformationMessage(
        `Quer cadastrar a API key de "${profile.name}" agora?`,
        'Cadastrar chave',
        'Depois'
      );

      if (shouldSetKey === 'Cadastrar chave') {
        await configureProfileApiKey(profileStore, profile);
      }
    }
  }
}

async function manageSkillsAndAgents(skillsStore) {
  const action = await vscode.window.showQuickPick([
    { label: '$(book) Ver skills instaladas', action: 'list-skills', description: 'Lista SKILL.md de ~/.openclaude/skills e do workspace' },
    { label: '$(plus) Criar skill nova', action: 'create-skill', description: 'Wizard pra criar pasta + SKILL.md básico' },
    { label: '$(file-add) Importar skill baixada', action: 'import-skill', description: 'Copia uma pasta com SKILL.md pra ~/.openclaude/skills' },
    { label: '$(folder-opened) Abrir pasta de skills', action: 'open-skills-folder', description: 'Abre ~/.openclaude/skills no explorer' },
    { label: '$(person) Ver agentes', action: 'list-agents', description: 'Lista agents de ~/.openclaude/agents e do workspace' },
    { label: '$(person-add) Criar agente novo', action: 'create-agent', description: 'Wizard pra criar um .md de agente' },
    { label: '$(folder-opened) Abrir pasta de agents', action: 'open-agents-folder', description: 'Abre ~/.openclaude/agents no explorer' }
  ], {
    placeHolder: 'Skills e agentes do OpenClaude'
  });

  if (!action) return;

  if (action.action === 'list-skills') {
    await pickSkillToOpen(skillsStore);
  } else if (action.action === 'create-skill') {
    await wizardCreateSkill(skillsStore);
  } else if (action.action === 'import-skill') {
    await wizardImportSkill(skillsStore);
  } else if (action.action === 'open-skills-folder') {
    await openInExplorer(path.join(skillsStore.userOpenClaudeDir, 'skills'), true);
  } else if (action.action === 'list-agents') {
    await pickAgentToOpen(skillsStore);
  } else if (action.action === 'create-agent') {
    await wizardCreateAgent(skillsStore);
  } else if (action.action === 'open-agents-folder') {
    await openInExplorer(path.join(skillsStore.userOpenClaudeDir, 'agents'), true);
  }
}

async function pickSkillToOpen(skillsStore) {
  const skills = skillsStore.listSkills();
  if (skills.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'Nenhuma skill encontrada. Quer criar uma?',
      'Criar skill', 'Cancelar'
    );
    if (choice === 'Criar skill') {
      await wizardCreateSkill(skillsStore);
    }
    return;
  }

  const picked = await vscode.window.showQuickPick(
    skills.map((skill) => ({
      label: skill.name,
      description: skill.source === 'project' ? '$(repo) workspace' : '$(home) user',
      detail: skill.description || '(sem descrição)',
      skill
    })),
    { placeHolder: 'Skills instaladas — selecione pra editar' }
  );

  if (!picked) return;

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.skill.filePath));
  await vscode.window.showTextDocument(doc);
}

async function pickAgentToOpen(skillsStore) {
  const agents = skillsStore.listAgents();
  if (agents.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'Nenhum agente encontrado. Quer criar um?',
      'Criar agente', 'Cancelar'
    );
    if (choice === 'Criar agente') {
      await wizardCreateAgent(skillsStore);
    }
    return;
  }

  const picked = await vscode.window.showQuickPick(
    agents.map((agent) => ({
      label: agent.name,
      description: [
        agent.source === 'project' ? '$(repo) workspace' : '$(home) user',
        agent.model ? `model: ${agent.model}` : ''
      ].filter(Boolean).join(' · '),
      detail: agent.description || '(sem descrição)',
      agent
    })),
    { placeHolder: 'Agentes disponíveis — selecione pra editar' }
  );

  if (!picked) return;

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.agent.filePath));
  await vscode.window.showTextDocument(doc);
}

async function wizardCreateSkill(skillsStore) {
  const scope = await vscode.window.showQuickPick(
    [
      { label: '$(home) Usuário (~/.openclaude/skills/)', value: 'user', description: 'Disponível em todos os workspaces' },
      { label: '$(repo) Workspace (.openclaude/skills/)', value: 'project', description: 'Disponível só nesse projeto' }
    ],
    { placeHolder: 'Onde criar a skill?' }
  );
  if (!scope) return;

  const name = await vscode.window.showInputBox({
    title: 'Nome da skill',
    prompt: 'Nome curto, sem espaços (ex: "code-reviewer", "bug-detective")',
    validateInput: (value) => value.trim() ? null : 'Nome obrigatório'
  });
  if (!name) return;

  const description = await vscode.window.showInputBox({
    title: 'Descrição',
    prompt: 'Uma frase explicando quando essa skill deve ser usada (visível pro modelo)',
    placeHolder: 'Use esta skill quando...'
  });

  try {
    const result = skillsStore.createSkill({ name, description, scope: scope.value });
    const choice = await vscode.window.showInformationMessage(
      `Skill criada em ${result.folderPath}`,
      'Abrir SKILL.md',
      'OK'
    );
    if (choice === 'Abrir SKILL.md') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.filePath));
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Não consegui criar a skill: ${error.message}`);
  }
}

async function wizardImportSkill(skillsStore) {
  const folder = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Importar pasta',
    title: 'Selecione a pasta da skill (deve conter SKILL.md)'
  });
  if (!folder || folder.length === 0) return;

  const scope = await vscode.window.showQuickPick(
    [
      { label: '$(home) Usuário', value: 'user' },
      { label: '$(repo) Workspace', value: 'project' }
    ],
    { placeHolder: 'Onde importar?' }
  );
  if (!scope) return;

  try {
    const result = skillsStore.importSkill(folder[0].fsPath, scope.value);
    vscode.window.showInformationMessage(`Skill importada em ${result.folderPath}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Não consegui importar: ${error.message}`);
  }
}

async function wizardCreateAgent(skillsStore) {
  const scope = await vscode.window.showQuickPick(
    [
      { label: '$(home) Usuário (~/.openclaude/agents/)', value: 'user', description: 'Disponível em todos os workspaces' },
      { label: '$(repo) Workspace (.openclaude/agents/)', value: 'project', description: 'Disponível só nesse projeto' }
    ],
    { placeHolder: 'Onde criar o agente?' }
  );
  if (!scope) return;

  const name = await vscode.window.showInputBox({
    title: 'Nome do agente',
    prompt: 'Identificador curto (ex: "code-reviewer", "frontend-dev")',
    validateInput: (value) => value.trim() ? null : 'Nome obrigatório'
  });
  if (!name) return;

  const description = await vscode.window.showInputBox({
    title: 'Descrição do agente',
    prompt: 'Uma frase explicando quando o agente deve ser invocado (visível pro modelo)',
    placeHolder: 'Use este agente quando...'
  });
  if (!description) return;

  const model = await vscode.window.showInputBox({
    title: 'Modelo (opcional)',
    prompt: 'Deixe vazio pra herdar do chat. Ex: gpt-4o, gemini-2.5-flash, sonnet',
    placeHolder: '(herdar)'
  });

  const prompt = await vscode.window.showInputBox({
    title: 'System prompt do agente (opcional)',
    prompt: 'Pode deixar vazio e editar depois no arquivo',
    placeHolder: 'Você é um especialista em...'
  });

  try {
    const result = skillsStore.createAgent({ name, description, model: model || '', prompt: prompt || '', scope: scope.value });
    const choice = await vscode.window.showInformationMessage(
      `Agente criado em ${result.filePath}`,
      'Abrir arquivo',
      'OK'
    );
    if (choice === 'Abrir arquivo') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.filePath));
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Não consegui criar o agente: ${error.message}`);
  }
}

async function openInExplorer(folderPath, createIfMissing = false) {
  if (!fs.existsSync(folderPath) && createIfMissing) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  if (!fs.existsSync(folderPath)) {
    vscode.window.showErrorMessage(`Pasta não existe: ${folderPath}`);
    return;
  }
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
}

async function configureProfileApiKey(profileStore, profile) {
  if (!profile) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    title: `API key para ${profile.name}`,
    prompt: 'A chave sera salva no SecretStorage do VS Code, nao em JSON.',
    password: true,
    ignoreFocusOut: true
  });

  if (!apiKey) {
    return;
  }

  await profileStore.setApiKey(profile, apiKey);
}

function defaultModelForProvider(provider) {
  if (provider === 'ollama') {
    return 'qwen2.5-coder:7b';
  }

  if (provider === 'gemini') {
    return 'gemini-3-flash-preview';
  }

  if (provider === 'mistral') {
    return 'devstral-latest';
  }

  if (provider === 'codex') {
    return 'codexplan';
  }

  return 'gpt-4o';
}

function defaultBaseUrlForProvider(provider) {
  if (provider === 'ollama') {
    return 'http://localhost:11434/v1';
  }

  if (provider === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta/openai';
  }

  if (provider === 'mistral') {
    return 'https://api.mistral.ai/v1';
  }

  if (provider === 'codex') {
    return 'https://chatgpt.com/backend-api/codex';
  }

  return 'https://api.openai.com/v1';
}

module.exports = {
  selectProfile,
  manageProfiles,
  manageSkillsAndAgents,
  configureProfileApiKey
};

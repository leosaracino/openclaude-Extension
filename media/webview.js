(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // -------------------------------------------------------------------------
  // SVG icons (themeable via currentColor)
  // -------------------------------------------------------------------------
  const ICONS = {
    caret:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 5.5L8 10l4.5-4.5z"/></svg>',
    close:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
    refresh:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 8a6 6 0 1 1-1.8-4.3"/><path d="M14 2.5V6h-3.5"/></svg>',
    settings:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm0 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/><path d="M7.1 1.4l-.3 1.5a5.4 5.4 0 0 0-1.4.6L4.1 2.7 2.7 4.1l.8 1.3a5.4 5.4 0 0 0-.6 1.4l-1.5.3v1.8l1.5.3c.13.5.34.97.6 1.4l-.8 1.3 1.4 1.4 1.3-.8c.43.26.9.47 1.4.6l.3 1.5h1.8l.3-1.5c.5-.13.97-.34 1.4-.6l1.3.8 1.4-1.4-.8-1.3c.26-.43.47-.9.6-1.4l1.5-.3V7.1l-1.5-.3a5.4 5.4 0 0 0-.6-1.4l.8-1.3-1.4-1.4-1.3.8a5.4 5.4 0 0 0-1.4-.6l-.3-1.5z" fill-rule="evenodd"/></svg>',
    send:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2l12 6-12 6 2-6-2-6z"/></svg>',
    stop:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.2"/></svg>',
    copy:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4.5" y="4.5" width="8" height="9" rx="1.2"/><path d="M3.5 11V3.5a1 1 0 0 1 1-1H10"/></svg>',
    check:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5L6.5 12 13 4.5"/></svg>',
    lock:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5a3 3 0 0 0-3 3V7H4.2a.7.7 0 0 0-.7.7V14a.7.7 0 0 0 .7.7h7.6a.7.7 0 0 0 .7-.7V7.7a.7.7 0 0 0-.7-.7H11V4.5a3 3 0 0 0-3-3zM6.5 7V4.5a1.5 1.5 0 0 1 3 0V7h-3z"/></svg>',
    chat:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.4l-2.6 2.6a.5.5 0 0 1-.85-.35V11.5h-.45a.5.5 0 0 1-.5-.5V3.5z"/></svg>',
    trash:
      '<svg class="svg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 4.2h10.4"/><path d="M6.2 4.2V2.8h3.6v1.4"/><path d="M5 6.2l.4 6.2h5.2l.4-6.2"/><path d="M7.1 7.4v3.8M8.9 7.4v3.8"/></svg>',
  };

  // -------------------------------------------------------------------------
  // OpenClaude slash commands (surfaced via the / autocomplete + the help
  // button on the chat-controls bar). Grouped by category so the menu is
  // browseable. The CLI handles the actual command — we just send the text.
  // -------------------------------------------------------------------------
  const SLASH_COMMANDS = [
    { command: '/help',           description: 'Mostra ajuda do OpenClaude',                         category: 'Sistema' },
    { command: '/clear',          description: 'Limpa contexto da conversa atual',                   category: 'Sessão'  },
    { command: '/compact',        description: 'Comprime histórico para liberar contexto',           category: 'Sessão'  },
    { command: '/resume',         description: 'Lista e retoma sessões salvas',                      category: 'Sessão'  },
    { command: '/export',         description: 'Exporta a conversa atual',                           category: 'Sessão'  },
    { command: '/model',          description: 'Troca o modelo da sessão',                           category: 'Modelo'  },
    { command: '/provider',       description: 'Setup interativo de provider e perfis',              category: 'Modelo'  },
    { command: '/onboard-github', description: 'Onboarding guiado do GitHub Models',                 category: 'Modelo'  },
    { command: '/fast',           description: 'Liga o modo Fast (Opus 4.6 com saída acelerada)',    category: 'Modelo'  },
    { command: '/init',           description: 'Cria CLAUDE.md no projeto',                          category: 'Workspace' },
    { command: '/memory',         description: 'Edita o memory file (CLAUDE.md)',                    category: 'Workspace' },
    { command: '/review',         description: 'Review automático de PR',                            category: 'Workflow'  },
    { command: '/agents',         description: 'Lista e configura agentes customizados',             category: 'Avançado'  },
    { command: '/mcp',            description: 'Lista e configura MCP servers',                      category: 'Avançado'  },
    { command: '/hooks',          description: 'Configura hooks de lifecycle',                       category: 'Avançado'  },
    { command: '/cost',           description: 'Custo acumulado da sessão atual',                    category: 'Diagnóstico' },
    { command: '/status',         description: 'Status da sessão',                                   category: 'Diagnóstico' },
    { command: '/doctor',         description: 'Diagnóstico do ambiente e dependências',             category: 'Diagnóstico' },
    { command: '/config',         description: 'Configurações do OpenClaude',                        category: 'Sistema' },
    { command: '/theme',          description: 'Troca o tema',                                       category: 'Sistema' },
    { command: '/vim',            description: 'Modo vim no input',                                  category: 'Sistema' },
    { command: '/release-notes',  description: 'Notas da versão atual',                              category: 'Sistema' },
    { command: '/terminal-setup', description: 'Configuração do terminal',                           category: 'Sistema' },
    { command: '/login',          description: 'Login Anthropic',                                    category: 'Auth' },
    { command: '/logout',         description: 'Logout',                                             category: 'Auth' },
  ];

  // -------------------------------------------------------------------------
  // State + DOM refs
  // -------------------------------------------------------------------------
  const state = {
    profiles: [],
    activeProfileId: undefined,
    sessions: new Map(),
    activeSessionId: undefined,
    history: [],
    historyLoaded: false,
    comboboxOpen: false,
    rufloMenuOpen: false,
    rufloSettingsOpen: false,
    rufloStatus: undefined,
    rufloLastAction: undefined,
    rufloPendingAction: undefined,
    stickToBottom: true,
    slashMenuOpen: false,
    slashMenuFiltered: [],
    slashMenuFocusIndex: 0,
    // Skills library state (Rodada 17). availableSkills is fetched once via
    // getAvailableSkills; activeSkills lives on session.activeSkills and is
    // mirrored here only for the open-menu render path.
    availableSkills: [],
    availableSkillsLoaded: false,
    skillsMenuOpen: false,
    skillsMenuFilter: '',
  };

  const refs = {
    combobox: document.getElementById('profileCombobox'),
    comboboxButton: document.getElementById('profileComboboxButton'),
    comboboxLabel: document.getElementById('profileComboboxLabel'),
    comboboxMenu: document.getElementById('profileComboboxMenu'),
    // manageBtn removed in Rodada 15 — the "Gerenciar modelos" action lives
    // as the last item of the profile combobox menu now, freeing toolbar space.
    tabs: document.getElementById('tabs'),
    home: document.getElementById('home'),
    chat: document.getElementById('chat'),
    messages: document.getElementById('messages'),
    historyList: document.getElementById('historyList'),
    historyRefresh: document.getElementById('refreshHistory'),
    composerInput: document.getElementById('composerInput'),
    sendBtn: document.getElementById('sendMessage'),
    startFirstChatBtn: document.getElementById('startFirstChat'),
    permissionBtns: Array.from(document.querySelectorAll('.permission-btn')),
    modeBtns: Array.from(document.querySelectorAll('.mode-btn')),
    thinkingToggle: document.getElementById('thinkingToggle'),
    apiKeyAlertBtn: document.getElementById('apiKeyAlert'),
    commandsButton: document.getElementById('commandsButton'),
    slashMenu: document.getElementById('slashMenu'),
    skillsToggle: document.getElementById('skillsToggle'),
    skillsToggleBadge: document.getElementById('skillsToggleBadge'),
    skillsMenu: document.getElementById('skillsMenu'),
    skillsMenuSearch: document.getElementById('skillsMenuSearch'),
    skillsMenuList: document.getElementById('skillsMenuList'),
    manageSkillsBtn: document.getElementById('manageSkills'),
    rufloControl: document.getElementById('rufloControl'),
    rufloStatusPill: document.getElementById('rufloStatusPill'),
    rufloMenu: document.getElementById('rufloMenu'),
    rufloSettings: document.getElementById('rufloSettings'),
    closeRufloSettingsBtn: document.getElementById('closeRufloSettings'),
    refreshRufloSettingsBtn: document.getElementById('refreshRufloSettings'),
    rufloSettingsSummary: document.getElementById('rufloSettingsSummary'),
    rufloCliStatus: document.getElementById('rufloCliStatus'),
    rufloMcpStatus: document.getElementById('rufloMcpStatus'),
    rufloDaemonStatus: document.getElementById('rufloDaemonStatus'),
    rufloMemoryStatus: document.getElementById('rufloMemoryStatus'),
    rufloWorkspaceStatus: document.getElementById('rufloWorkspaceStatus'),
    rufloWorkspaceName: document.getElementById('rufloWorkspaceName'),
    rufloWorkspaceHint: document.getElementById('rufloWorkspaceHint'),
    rufloDaemonSummary: document.getElementById('rufloDaemonSummary'),
    rufloDaemonMeta: document.getElementById('rufloDaemonMeta'),
    rufloMemorySummary: document.getElementById('rufloMemorySummary'),
    rufloMemoryMeta: document.getElementById('rufloMemoryMeta'),
    rufloToggleMcpBtn: document.getElementById('rufloToggleMcp'),
    rufloToggleDaemonBtn: document.getElementById('rufloToggleDaemon'),
    rufloInitMemoryBtn: document.getElementById('rufloInitMemory'),
    rufloDeleteMemoryBtn: document.getElementById('rufloDeleteMemory'),
    rufloDoctorBtn: document.getElementById('rufloDoctor'),
    rufloOpenCliBtn: document.getElementById('rufloOpenCli'),
    rufloDetails: document.getElementById('rufloDetails'),
  };

  // SVG ícone de blocos/grid pra Skills (representa módulos/extensões)
  ICONS.skills = '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>';

  // Inject SVGs into static buttons. The "Modelos" button no longer exists
  // as a toolbar element (Rodada 15 moved it inside the profile combobox),
  // so we don't inject into it anymore.
  refs.manageSkillsBtn.innerHTML = ICONS.skills + '<span>Skills</span>';
  refs.historyRefresh.innerHTML = ICONS.refresh;
  refs.historyRefresh.setAttribute('aria-label', 'Atualizar histórico');
  refs.historyRefresh.setAttribute('title', 'Atualizar histórico');
  refs.sendBtn.innerHTML = ICONS.send;
  refs.sendBtn.setAttribute('aria-label', 'Enviar');
  refs.apiKeyAlertBtn.innerHTML = ICONS.lock;
  refs.apiKeyAlertBtn.setAttribute('aria-label', 'Cadastrar API key do perfil ativo');
  refs.closeRufloSettingsBtn.innerHTML = ICONS.close;
  refs.refreshRufloSettingsBtn.innerHTML = ICONS.refresh;
  refs.commandsButton.innerHTML = '<svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 4.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5zm-3 3.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1A.5.5 0 0 1 3 8zm3 0a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6A.5.5 0 0 1 6 8zm-3 3.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/></svg>';
  refs.commandsButton.setAttribute('aria-label', 'Ver comandos do OpenClaude');

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function activeSession() {
    return state.sessions.get(state.activeSessionId);
  }

  function activeProfile() {
    return state.profiles.find((p) => p.id === state.activeProfileId);
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || '';
    }
  }

  // -------------------------------------------------------------------------
  // Combobox (custom dropdown for profile selection)
  // -------------------------------------------------------------------------
  function openCombobox() {
    // Always open, even with zero profiles — the menu now always contains
    // the "Gerenciar modelos" action so the user has a way in to cadastrar
    // the first profile when the list is empty.
    state.comboboxOpen = true;
    refs.combobox.dataset.open = 'true';
    refs.comboboxButton.setAttribute('aria-expanded', 'true');
    renderComboboxMenu();
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    document.addEventListener('keydown', onComboboxKeydown, true);
  }

  function closeCombobox() {
    state.comboboxOpen = false;
    refs.combobox.dataset.open = 'false';
    refs.comboboxButton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onComboboxKeydown, true);
  }

  function toggleCombobox() {
    if (state.comboboxOpen) closeCombobox();
    else openCombobox();
  }

  function onDocumentMouseDown(event) {
    if (!refs.combobox.contains(event.target)) {
      closeCombobox();
    }
  }

  function onComboboxKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCombobox();
      refs.comboboxButton.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const options = Array.from(refs.comboboxMenu.querySelectorAll('.combobox-option'));
      if (!options.length) return;
      const idx = options.indexOf(document.activeElement);
      const next =
        event.key === 'ArrowDown' ? (idx + 1) % options.length : (idx - 1 + options.length) % options.length;
      options[next].focus();
    } else if (event.key === 'Enter' && document.activeElement?.classList?.contains('combobox-option')) {
      event.preventDefault();
      document.activeElement.click();
    }
  }

  function renderComboboxButton() {
    const profile = activeProfile();
    if (!profile) {
      refs.comboboxLabel.textContent = 'Nenhum perfil';
      refs.apiKeyAlertBtn.classList.add('hidden');
      return;
    }
    const needsKey = profile.needsApiKey && !profile.hasApiKey;
    refs.comboboxLabel.innerHTML = '';
    const name = document.createElement('span');
    name.textContent = profile.name + ' · ' + (profile.model || 'sem modelo');
    refs.comboboxLabel.appendChild(name);
    if (needsKey) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'sem chave';
      refs.comboboxLabel.appendChild(badge);
    }
    // Surface the API-key-missing state directly on the toolbar — pulsing
    // button next to the combobox so it can't be missed.
    refs.apiKeyAlertBtn.classList.toggle('hidden', !needsKey);
  }

  function renderComboboxMenu() {
    refs.comboboxMenu.textContent = '';

    if (state.profiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'combobox-empty';
      empty.textContent = 'Nenhum modelo cadastrado ainda.';
      refs.comboboxMenu.appendChild(empty);
    }

    for (const profile of state.profiles) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'combobox-option';
      opt.role = 'option';
      opt.dataset.value = profile.id;
      opt.setAttribute('aria-selected', String(profile.id === state.activeProfileId));

      const name = document.createElement('span');
      name.className = 'combobox-option-name';
      name.textContent = profile.name + ' · ' + (profile.model || 'sem modelo');

      const meta = document.createElement('span');
      meta.className = 'combobox-option-meta';
      if (profile.needsApiKey && !profile.hasApiKey) {
        meta.textContent = 'sem API key';
      } else {
        meta.textContent = profile.provider;
      }

      opt.appendChild(name);
      opt.appendChild(meta);

      opt.addEventListener('click', () => {
        vscode.postMessage({ command: 'selectProfile', profileId: profile.id });
        closeCombobox();
      });

      refs.comboboxMenu.appendChild(opt);
    }

    // Divider + "manage" action at the bottom of the menu. This replaces the
    // standalone "Modelos" button that used to live in the toolbar. Clicking
    // here fires the same `manageProfiles` host command, which opens the
    // native VS Code Quick Pick flow for cadastrar/editar/remover modelos.
    if (state.profiles.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'combobox-divider';
      divider.setAttribute('role', 'separator');
      refs.comboboxMenu.appendChild(divider);
    }

    const manageOpt = document.createElement('button');
    manageOpt.type = 'button';
    manageOpt.className = 'combobox-option combobox-option-action';
    manageOpt.role = 'option';
    manageOpt.dataset.action = 'manage';

    const manageName = document.createElement('span');
    manageName.className = 'combobox-option-name';
    manageName.textContent =
      state.profiles.length === 0
        ? '+ Cadastrar primeiro modelo'
        : '+ Editar / cadastrar modelos';
    manageOpt.appendChild(manageName);

    manageOpt.addEventListener('click', () => {
      vscode.postMessage({ command: 'manageProfiles' });
      closeCombobox();
    });

    refs.comboboxMenu.appendChild(manageOpt);
  }

  refs.comboboxButton.addEventListener('click', toggleCombobox);
  refs.comboboxButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      openCombobox();
      const first = refs.comboboxMenu.querySelector('.combobox-option');
      first?.focus();
    }
  });

  // -------------------------------------------------------------------------
  // Tabs (incremental render to avoid flicker)
  // -------------------------------------------------------------------------
  function ensureTabElement(session) {
    let tab = refs.tabs.querySelector('[data-session-id="' + session.id + '"]');
    if (tab) return tab;

    tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.sessionId = session.id;
    tab.setAttribute('role', 'tab');
    tab.tabIndex = 0;

    const title = document.createElement('span');
    title.className = 'tab-title';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = ICONS.close;
    closeBtn.setAttribute('aria-label', 'Fechar aba');
    closeBtn.title = 'Fechar';

    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ command: 'closeChat', sessionId: session.id });
    });

    tab.addEventListener('click', () => {
      state.activeSessionId = session.id;
      vscode.postMessage({ command: 'switchChat', sessionId: session.id });
      render();
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        tab.click();
      }
    });

    tab.appendChild(title);
    tab.appendChild(closeBtn);
    refs.tabs.appendChild(tab);
    return tab;
  }

  function renderTabs() {
    const seen = new Set();
    for (const session of state.sessions.values()) {
      seen.add(session.id);
      const tab = ensureTabElement(session);
      tab.classList.toggle('active', session.id === state.activeSessionId);
      tab.title =
        session.profileName + (session.openClaudeSessionId ? ' · ' + session.openClaudeSessionId : '');
      const titleEl = tab.querySelector('.tab-title');
      if (titleEl.textContent !== session.title) titleEl.textContent = session.title;
    }
    // Remove tabs that no longer exist
    for (const tab of Array.from(refs.tabs.children)) {
      if (!seen.has(tab.dataset.sessionId)) tab.remove();
    }
  }

  // -------------------------------------------------------------------------
  // History list
  // -------------------------------------------------------------------------
  function renderHistory() {
    refs.historyList.textContent = '';

    if (!state.historyLoaded) {
      for (let i = 0; i < 3; i += 1) {
        const skel = document.createElement('div');
        skel.className = 'skeleton skeleton-history';
        refs.historyList.appendChild(skel);
      }
      return;
    }

    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma sessão encontrada ainda.';
      refs.historyList.appendChild(empty);
      return;
    }

    for (const item of state.history) {
      const row = document.createElement('div');
      row.className = 'history-row';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.title = item.title || item.id;

      const icon = document.createElement('span');
      icon.className = 'history-item-icon';
      icon.innerHTML = ICONS.chat;

      const body = document.createElement('span');
      body.className = 'history-item-body';

      const title = document.createElement('span');
      title.className = 'history-item-title';
      title.textContent = item.title || item.id;

      const meta = document.createElement('span');
      meta.className = 'history-item-meta';
      meta.textContent = formatDate(item.updatedAt);

      body.appendChild(title);
      body.appendChild(meta);

      const chip = document.createElement('span');
      chip.className = 'history-item-chip';
      if (item.source === 'codex') {
        chip.classList.add('history-item-chip-codex');
        chip.textContent = 'Codex';
      } else {
        chip.textContent = item.projectLabel || '';
      }

      button.appendChild(icon);
      button.appendChild(body);
      if (chip.textContent) button.appendChild(chip);

      // Codex threads can't be resumed in OpenClaude — route them to the
      // viewer mode handler instead. OpenClaude threads keep using resume.
      button.addEventListener('click', () => {
        if (item.source === 'codex') {
          vscode.postMessage({
            command: 'viewHistorySession',
            sessionId: item.id,
            source: 'codex',
          });
        } else {
          vscode.postMessage({ command: 'resumeSession', sessionId: item.id });
        }
      });

      // Codex threads aren't ours to delete — hide the trash button for them.
      const showDelete = item.source !== 'codex';
      let deleteBtn;
      if (showDelete) {
        deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'history-delete icon-only';
        deleteBtn.innerHTML = ICONS.trash;
        deleteBtn.title = 'Apagar historico';
        deleteBtn.setAttribute('aria-label', 'Apagar historico');

        deleteBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          deleteBtn.disabled = true;
          vscode.postMessage({
            command: 'deleteHistorySession',
            sessionId: item.id,
            title: item.title || item.id,
          });
        });
      }

      row.appendChild(button);
      if (deleteBtn) row.appendChild(deleteBtn);
      refs.historyList.appendChild(row);
    }
  }

  // -------------------------------------------------------------------------
  // Messages render
  // -------------------------------------------------------------------------
  // Cache of the last-rendered messages signature. Lets us skip the
  // expensive DOM clear+rebuild when only session-level fields changed
  // (e.g. permissionMode toggle, thinking toggle, status update) — so
  // toggling things doesn't flicker the chat or collapse <details> blocks.
  let lastRenderedSessionId;
  let lastMessagesSignature = '';

  function computeMessagesSignature(session) {
    if (!session) return '';
    const messages = session.messages || [];
    const parts = [
      String(messages.length),
      session.viewer ? 'v' : 'n',
      String((session.pendingPermissions || []).length)
    ];
    for (const m of messages) {
      parts.push(
        m.id +
        '|' + (m.role || '') +
        '|' + (m.text ? m.text.length : 0) +
        '|' + (m.toolStatus || '') +
        '|' + (m.toolResult ? m.toolResult.length : 0) +
        '|' + (m.final ? '1' : '0') +
        '|' + (m.files ? m.files.length : 0)
      );
    }
    return parts.join('~');
  }

  function renderActiveSession() {
    const session = activeSession();
    const settingsOpen = Boolean(state.rufloSettingsOpen);
    refs.home.classList.toggle('hidden', Boolean(session) || settingsOpen);
    refs.chat.classList.toggle('hidden', !session || settingsOpen);
    refs.rufloSettings.classList.toggle('hidden', !settingsOpen);
    refs.chat.classList.toggle('viewer', Boolean(session?.viewer));

    if (!session) {
      refs.sendBtn.dataset.mode = 'send';
      refs.sendBtn.innerHTML = ICONS.send;
      refs.sendBtn.setAttribute('aria-label', 'Enviar');
      refs.messages.textContent = '';
      lastRenderedSessionId = undefined;
      lastMessagesSignature = '';
      return;
    }

    // Send button morphs into a Stop square while streaming. Click then
    // routes to the stop handler instead of sending.
    const streaming = Boolean(session.streaming);
    refs.sendBtn.dataset.mode = streaming ? 'stop' : 'send';
    refs.sendBtn.innerHTML = streaming ? ICONS.stop : ICONS.send;
    refs.sendBtn.setAttribute('aria-label', streaming ? 'Parar resposta' : 'Enviar');

    // Reflect live session settings on the controls bar.
    const mode = session.permissionMode || 'acceptEdits';
    for (const btn of refs.permissionBtns) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
    // Operation mode: 'single' or 'swarm'. Legacy sessions might still carry
    // 'default'/'plan' → fall back to 'single'; legacy 'ruflo' → 'swarm'.
    let opMode = session.mode;
    if (opMode === 'ruflo') opMode = 'swarm';
    else if (opMode !== 'swarm') opMode = 'single';
    const pendingMode = session.modeSwitching ? session.pendingMode : undefined;
    for (const btn of refs.modeBtns) {
      btn.classList.toggle('active', btn.dataset.mode === opMode);
      btn.classList.toggle('switching', btn.dataset.mode === pendingMode);
      btn.disabled = Boolean(session.modeSwitching);
    }
    refs.thinkingToggle.setAttribute('aria-pressed', session.thinkingEnabled ? 'true' : 'false');

    // Counter badge on the "+ Skills" button reflects activeSkills.length.
    updateSkillsBadge(session);

    // Skip the messages re-render entirely when nothing message-shaped
    // changed. Toggling thinking/permission triggers a sessionUpdated but
    // doesn't touch the message log — without this skip, the DOM would
    // get blown away and rebuilt on every toggle, collapsing <details>
    // open state and producing the visible "all cards re-open" flicker.
    const sig = computeMessagesSignature(session);
    if (lastRenderedSessionId === session.id && sig === lastMessagesSignature) {
      return;
    }
    lastRenderedSessionId = session.id;
    lastMessagesSignature = sig;

    // Capture currently-open <details> by message id before clearing, so
    // even when we DO re-render (a new message arrived), the user's
    // manual expand state survives.
    const openIds = new Set();
    for (const det of refs.messages.querySelectorAll('details')) {
      if (det.open && det.dataset.messageId) {
        openIds.add(det.dataset.messageId);
      }
    }

    refs.messages.textContent = '';

    // Viewer banner — read-only banner with a "Continuar" button when the
    // session is a Codex import. Sits above the historic messages.
    if (session.viewer) {
      refs.messages.appendChild(renderViewerBanner(session));
    }

    for (const message of session.messages || []) {
      refs.messages.appendChild(renderMessage(message));
    }

    // Pending permission requests render AFTER the message log so they
    // sit at the bottom of the visible area (next to the composer) — the
    // auto-scroll to bottom keeps them in view. Putting them at the top
    // hid them above the viewport whenever the chat had any history.
    for (const permission of session.pendingPermissions || []) {
      refs.messages.appendChild(renderPermissionCard(session, permission));
    }

    // Restore open state on whatever survived the re-render.
    for (const det of refs.messages.querySelectorAll('details')) {
      if (openIds.has(det.dataset.messageId)) {
        det.open = true;
      }
    }

    // Always force scroll to bottom when a permission card just appeared,
    // even if the user had scrolled away. Permissions are blocking and
    // they need to see them.
    const hasPendingPermission = (session.pendingPermissions || []).length > 0;
    if (state.stickToBottom || hasPendingPermission) {
      requestAnimationFrame(() => {
        refs.messages.scrollTop = refs.messages.scrollHeight;
      });
    }
  }

  function renderMessage(message) {
    // Thinking messages render as a collapsible <details> block so the
    // chain-of-thought sits visibly above the answer without dominating.
    if (message.role === 'thinking') {
      return renderThinkingMessage(message);
    }

    // Tool calls are rendered as a single collapsible card per tool_use_id
    // — the host's upsertToolCard ensures content_block_start, the
    // populated assistant event, and the tool_result all merge into one
    // message instead of producing 3-5 fragments.
    if (message.role === 'tool' && message.toolUseId !== undefined) {
      return renderToolCard(message);
    }

    // GitHub-style "files changed" summary appended at end of assistant
    // turn whenever the model touched any files.
    if (message.role === 'files-changed') {
      return renderFilesChangedCard(message);
    }

    const node = document.createElement('article');
    node.className = 'message ' + (message.role || 'system');
    node.dataset.messageId = message.id;

    if (message.title) {
      const titleEl = document.createElement('span');
      titleEl.className = 'message-title';
      titleEl.textContent = message.title;
      node.appendChild(titleEl);
    }

    if (message.role === 'tool') {
      // Legacy tool message without toolUseId (older history) — render as pre.
      const pre = document.createElement('pre');
      pre.className = 'tool-payload';
      pre.textContent = message.text || '';
      node.appendChild(pre);
    } else {
      const body = document.createElement('div');
      body.className = 'message-body';
      body.textContent = message.text || '';
      node.appendChild(body);
    }

    if (message.text && message.role !== 'system') {
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'message-copy';
      copyBtn.innerHTML = ICONS.copy;
      copyBtn.setAttribute('aria-label', 'Copiar mensagem');
      copyBtn.title = 'Copiar';

      copyBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(message.text);
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = ICONS.check;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = ICONS.copy;
          }, 1200);
        } catch {
          // Clipboard may be blocked; ignore silently.
        }
      });

      node.appendChild(copyBtn);
    }

    return node;
  }

  function renderThinkingMessage(message) {
    const node = document.createElement('details');
    node.className = 'message thinking';
    node.dataset.messageId = message.id;
    // Auto-open while streaming so the user can watch the reasoning unfold;
    // collapse once the block is final.
    node.open = !message.final;

    const summary = document.createElement('summary');
    summary.className = 'thinking-summary';

    const dot = document.createElement('span');
    dot.className = 'thinking-summary-dot';
    summary.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'thinking-summary-label';
    label.textContent = message.final ? 'Pensamento' : 'Pensando…';
    summary.appendChild(label);

    node.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'thinking-body';
    body.textContent = message.text || '';
    node.appendChild(body);

    return node;
  }

  function renderFilesChangedCard(message) {
    const node = document.createElement('article');
    node.className = 'message files-changed';
    node.dataset.messageId = message.id;

    const header = document.createElement('div');
    header.className = 'files-changed-header';
    const title = document.createElement('span');
    title.className = 'files-changed-title';
    const count = (message.files || []).length;
    title.textContent = count === 1 ? '1 arquivo alterado' : `${count} arquivos alterados`;
    header.appendChild(title);
    node.appendChild(header);

    const list = document.createElement('div');
    list.className = 'files-changed-list';

    for (const file of message.files || []) {
      const row = document.createElement('div');
      row.className = 'files-changed-row';

      const info = document.createElement('div');
      info.className = 'files-changed-info';

      // Split path into directory and filename so the dir renders smaller.
      const fullPath = String(file.filePath || '');
      const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
      const dir = lastSlash >= 0 ? fullPath.slice(0, lastSlash + 1) : '';
      const name = lastSlash >= 0 ? fullPath.slice(lastSlash + 1) : fullPath;

      if (dir) {
        const dirSpan = document.createElement('span');
        dirSpan.className = 'files-changed-dir';
        dirSpan.textContent = dir;
        info.appendChild(dirSpan);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'files-changed-name';
      nameSpan.textContent = name;
      info.appendChild(nameSpan);

      if (file.kind === 'created') {
        const tag = document.createElement('span');
        tag.className = 'files-changed-tag';
        tag.textContent = 'novo';
        info.appendChild(tag);
      }

      row.appendChild(info);

      const stats = document.createElement('div');
      stats.className = 'files-changed-stats';

      if (file.added > 0) {
        const added = document.createElement('span');
        added.className = 'files-changed-added';
        added.textContent = `+${file.added}`;
        stats.appendChild(added);
      }
      if (file.removed > 0) {
        const removed = document.createElement('span');
        removed.className = 'files-changed-removed';
        removed.textContent = `-${file.removed}`;
        stats.appendChild(removed);
      }

      row.appendChild(stats);
      list.appendChild(row);
    }

    node.appendChild(list);
    return node;
  }

  function renderViewerBanner(session) {
    const node = document.createElement('div');
    node.className = 'viewer-banner';

    const text = document.createElement('div');
    text.className = 'viewer-banner-text';
    const sourceLabel = session.viewerSource === 'codex' ? 'Codex' : 'Histórico';
    const heading = document.createElement('strong');
    heading.textContent = `Modo leitura — ${sourceLabel}`;
    text.appendChild(heading);
    const sub = document.createElement('div');
    sub.className = 'viewer-banner-sub';
    sub.textContent = 'Não dá pra continuar essa thread aqui. Clique ao lado para importar o contexto e seguir conversando com OpenClaude.';
    text.appendChild(sub);
    node.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary viewer-banner-cta';
    button.textContent = 'Continuar com OpenClaude';
    button.addEventListener('click', () => {
      vscode.postMessage({
        command: 'promoteViewerToChat',
        sessionId: session.id,
      });
    });
    node.appendChild(button);

    return node;
  }

  function renderToolCard(message) {
    const node = document.createElement('details');
    const status = message.toolStatus || 'pending';
    node.className = 'message tool-card status-' + status;
    node.dataset.messageId = message.id;
    // Auto-expand only when there's an error, so the user sees what failed.
    node.open = status === 'error';

    const summary = document.createElement('summary');
    summary.className = 'tool-card-summary';

    const dot = document.createElement('span');
    dot.className = 'tool-card-status';
    dot.dataset.status = status;
    summary.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'tool-card-name';
    name.textContent = message.toolName || 'tool';
    summary.appendChild(name);

    const summaryText = document.createElement('span');
    summaryText.className = 'tool-card-summary-text';
    summaryText.textContent = message.toolSummary || '';
    summary.appendChild(summaryText);

    node.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'tool-card-body';

    const argsLabel = document.createElement('div');
    argsLabel.className = 'tool-card-section-label';
    argsLabel.textContent = 'Args';
    body.appendChild(argsLabel);

    const argsPre = document.createElement('pre');
    argsPre.className = 'tool-card-pre';
    let argsText;
    try {
      argsText = JSON.stringify(message.toolInput || {}, null, 2);
    } catch {
      argsText = String(message.toolInput);
    }
    if (argsText.length > 4000) {
      argsText = argsText.slice(0, 4000) + '\n…';
    }
    argsPre.textContent = argsText;
    body.appendChild(argsPre);

    if (message.toolResult !== null && message.toolResult !== undefined) {
      const outLabel = document.createElement('div');
      outLabel.className = 'tool-card-section-label';
      outLabel.textContent = status === 'error' ? 'Erro' : 'Output';
      body.appendChild(outLabel);

      const outPre = document.createElement('pre');
      outPre.className = 'tool-card-pre';
      let outText = String(message.toolResult || '');
      if (outText.length > 4000) {
        outText = outText.slice(0, 4000) + '\n… (truncado)';
      }
      outPre.textContent = outText;
      body.appendChild(outPre);
    }

    node.appendChild(body);
    return node;
  }

  function truncatePermissionText(value, max = 220) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function formatPermissionSummary(permission) {
    const toolName = String(permission.toolName || '').trim();
    const input = permission.toolInput || {};
    const normalized = toolName.toLowerCase().replace(/[\s_-]+/g, '');
    const targetPath = input.file_path || input.notebook_path || input.path;

    if (normalized === 'bash' || normalized === 'bashoutput' || normalized === 'executecommand' || normalized === 'runcommand') {
      return `Allow OpenClaude to run: ${truncatePermissionText(input.command || toolName || 'command')}`;
    }

    if (normalized === 'read' || normalized === 'readfile') {
      return `Allow OpenClaude to read: ${truncatePermissionText(targetPath || input.pattern || toolName || 'file')}`;
    }

    if (normalized === 'write' || normalized === 'writefile' || normalized === 'edit' || normalized === 'multiedit' || normalized === 'notebookedit') {
      return `Allow OpenClaude to write to: ${truncatePermissionText(targetPath || toolName || 'file')}`;
    }

    if (normalized === 'grep' || normalized === 'glob' || normalized === 'ls' || normalized === 'listfiles') {
      return `Allow OpenClaude to read: ${truncatePermissionText(input.pattern || targetPath || input.command || toolName || 'workspace')}`;
    }

    return `Allow OpenClaude to use: ${truncatePermissionText(toolName || 'tool')}`;
  }

  function renderPermissionCard(session, permission) {
    const node = document.createElement('div');
    node.className = 'permission';

    const icon = document.createElement('span');
    icon.className = 'permission-icon';
    icon.innerHTML = ICONS.lock;
    node.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'permission-body';

    const title = document.createElement('strong');
    title.className = 'permission-title';
    title.textContent = formatPermissionSummary(permission);
    body.appendChild(title);

    if (permission.description) {
      const desc = document.createElement('div');
      desc.className = 'permission-description';
      desc.textContent = permission.description;
      body.appendChild(desc);
    }

    const actions = document.createElement('div');
    actions.className = 'permission-actions';

    const allow = document.createElement('button');
    allow.type = 'button';
    allow.className = 'permission-approve';
    allow.textContent = 'Approve';
    allow.addEventListener('click', () => {
      vscode.postMessage({
        command: 'permissionResponse',
        sessionId: session.id,
        requestId: permission.id,
        decision: 'allow',
        toolInput: permission.toolInput || {},
      });
    });

    const deny = document.createElement('button');
    deny.type = 'button';
    deny.className = 'permission-deny';
    deny.textContent = 'Deny';
    deny.addEventListener('click', () => {
      vscode.postMessage({
        command: 'permissionResponse',
        sessionId: session.id,
        requestId: permission.id,
        decision: 'deny',
        toolInput: permission.toolInput || {},
      });
    });

    const denyWithSuggestion = document.createElement('button');
    denyWithSuggestion.type = 'button';
    denyWithSuggestion.className = 'permission-suggest';
    denyWithSuggestion.textContent = 'Suggest';

    actions.appendChild(allow);
    actions.appendChild(deny);
    actions.appendChild(denyWithSuggestion);
    body.appendChild(actions);

    // Inline suggestion form, hidden until the user clicks the third button.
    const suggestionWrap = document.createElement('div');
    suggestionWrap.className = 'permission-suggestion hidden';

    const textarea = document.createElement('textarea');
    textarea.className = 'permission-suggestion-input';
    textarea.rows = 3;
    textarea.placeholder = 'Diga ao agente o que fazer no lugar dessa ação...';
    suggestionWrap.appendChild(textarea);

    const suggestionActions = document.createElement('div');
    suggestionActions.className = 'permission-suggestion-actions';

    const sendSuggestion = document.createElement('button');
    sendSuggestion.type = 'button';
    sendSuggestion.className = 'primary';
    sendSuggestion.textContent = 'Recusar e enviar sugestão';
    sendSuggestion.addEventListener('click', () => {
      const suggestion = textarea.value.trim();
      if (!suggestion) {
        textarea.focus();
        return;
      }
      vscode.postMessage({
        command: 'permissionResponse',
        sessionId: session.id,
        requestId: permission.id,
        decision: 'deny',
        toolInput: permission.toolInput || {},
        suggestion,
      });
    });

    const cancelSuggestion = document.createElement('button');
    cancelSuggestion.type = 'button';
    cancelSuggestion.className = 'ghost';
    cancelSuggestion.textContent = 'Cancelar';
    cancelSuggestion.addEventListener('click', () => {
      suggestionWrap.classList.add('hidden');
      denyWithSuggestion.classList.remove('hidden');
    });

    suggestionActions.appendChild(sendSuggestion);
    suggestionActions.appendChild(cancelSuggestion);
    suggestionWrap.appendChild(suggestionActions);

    denyWithSuggestion.addEventListener('click', () => {
      suggestionWrap.classList.remove('hidden');
      denyWithSuggestion.classList.add('hidden');
      textarea.focus();
    });

    body.appendChild(suggestionWrap);
    node.appendChild(body);
    return node;
  }

  // -------------------------------------------------------------------------
  // Smart auto-scroll: track whether the user is "at the bottom" so streaming
  // updates keep following along, but don't yank them up if they scrolled away.
  // -------------------------------------------------------------------------
  refs.messages.addEventListener('scroll', () => {
    const distance = refs.messages.scrollHeight - refs.messages.scrollTop - refs.messages.clientHeight;
    state.stickToBottom = distance < 80;
  });

  // -------------------------------------------------------------------------
  // Slash command menu — autocomplete when typing `/` and a help button
  // that opens the unfiltered list. Keyboard-friendly: ↑/↓ to navigate,
  // Enter/Tab to select, Esc to dismiss.
  // -------------------------------------------------------------------------
  function getSlashFilter() {
    const value = refs.composerInput.value;
    const cursor = refs.composerInput.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    // Only autocomplete when the textarea starts with `/` and the user is
    // still typing the command itself (no whitespace yet).
    if (!beforeCursor.startsWith('/')) {
      return undefined;
    }
    if (/\s/.test(beforeCursor)) {
      return undefined;
    }
    return beforeCursor.slice(1).toLowerCase();
  }

  function filterSlashCommands(query) {
    if (!query) return SLASH_COMMANDS.slice();
    return SLASH_COMMANDS.filter((item) =>
      item.command.slice(1).toLowerCase().startsWith(query)
    );
  }

  function openSlashMenu(filter) {
    state.slashMenuFiltered = filterSlashCommands(filter || '');
    state.slashMenuFocusIndex = 0;
    state.slashMenuOpen = true;
    refs.slashMenu.classList.remove('hidden');
    refs.commandsButton.setAttribute('aria-expanded', 'true');
    renderSlashMenu();
  }

  function closeSlashMenu() {
    state.slashMenuOpen = false;
    refs.slashMenu.classList.add('hidden');
    refs.commandsButton.setAttribute('aria-expanded', 'false');
  }

  function renderSlashMenu() {
    refs.slashMenu.textContent = '';
    if (!state.slashMenuFiltered.length) {
      const empty = document.createElement('div');
      empty.className = 'slash-menu-empty';
      empty.textContent = 'Nenhum comando bate com isso.';
      refs.slashMenu.appendChild(empty);
      return;
    }

    // Group by category, preserving the order they appear in.
    const seenCategories = new Set();
    state.slashMenuFiltered.forEach((item, index) => {
      if (!seenCategories.has(item.category)) {
        seenCategories.add(item.category);
        const header = document.createElement('div');
        header.className = 'slash-menu-section';
        header.textContent = item.category;
        refs.slashMenu.appendChild(header);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slash-menu-item' + (index === state.slashMenuFocusIndex ? ' focused' : '');
      button.dataset.index = String(index);
      button.role = 'option';

      const name = document.createElement('span');
      name.className = 'slash-menu-item-name';
      name.textContent = item.command;
      button.appendChild(name);

      const desc = document.createElement('span');
      desc.className = 'slash-menu-item-desc';
      desc.textContent = item.description;
      button.appendChild(desc);

      button.addEventListener('mouseenter', () => {
        state.slashMenuFocusIndex = index;
        updateSlashFocus();
      });
      button.addEventListener('click', () => {
        applySlashCommand(item);
      });

      refs.slashMenu.appendChild(button);
    });
  }

  function updateSlashFocus() {
    const items = refs.slashMenu.querySelectorAll('.slash-menu-item');
    items.forEach((item, idx) => {
      item.classList.toggle('focused', idx === state.slashMenuFocusIndex);
      if (idx === state.slashMenuFocusIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function applySlashCommand(item) {
    refs.composerInput.value = item.command + ' ';
    refs.composerInput.focus();
    refs.composerInput.setSelectionRange(refs.composerInput.value.length, refs.composerInput.value.length);
    autosizeTextarea();
    closeSlashMenu();
  }

  function moveSlashFocus(delta) {
    if (!state.slashMenuFiltered.length) return;
    const len = state.slashMenuFiltered.length;
    state.slashMenuFocusIndex = (state.slashMenuFocusIndex + delta + len) % len;
    updateSlashFocus();
  }

  function maybeUpdateSlashMenuFromInput() {
    const filter = getSlashFilter();
    if (filter === undefined) {
      if (state.slashMenuOpen) closeSlashMenu();
      return;
    }
    state.slashMenuFiltered = filterSlashCommands(filter);
    state.slashMenuFocusIndex = 0;
    if (!state.slashMenuOpen) {
      state.slashMenuOpen = true;
      refs.slashMenu.classList.remove('hidden');
    }
    renderSlashMenu();
  }

  refs.commandsButton.addEventListener('click', () => {
    if (state.slashMenuOpen) {
      console.log('[CommandsMenu] close');
      closeSlashMenu();
    } else {
      console.log('[CommandsMenu] open (unfiltered)');
      openSlashMenu('');
      refs.composerInput.focus();
    }
  });

  // -------------------------------------------------------------------------
  // Skills picker (Rodada 17) — opt-in per session from the user's library.
  // Library is fetched once via `getAvailableSkills` and cached client-side;
  // activeSkills lives on the session and is mirrored back via sessionUpdated.
  // -------------------------------------------------------------------------
  function activeSkillsOf(session) {
    return Array.isArray(session?.activeSkills) ? session.activeSkills : [];
  }

  // Updates only the count badge on the "+ Skills" toggle. Used both after
  // sessionUpdated arrives and after optimistic local mutations from the
  // picker so the count stays in sync without re-rendering anything else.
  function updateSkillsBadge(session) {
    if (!refs.skillsToggleBadge) return;
    const count = activeSkillsOf(session).length;
    if (count === 0) {
      refs.skillsToggleBadge.classList.add('hidden');
      refs.skillsToggleBadge.textContent = '0';
    } else {
      refs.skillsToggleBadge.classList.remove('hidden');
      refs.skillsToggleBadge.textContent = String(count);
    }
  }

  function openSkillsMenu() {
    if (!refs.skillsMenu) return;
    state.skillsMenuOpen = true;
    refs.skillsMenu.classList.remove('hidden');
    if (refs.skillsToggle) {
      refs.skillsToggle.setAttribute('aria-expanded', 'true');
    }
    // First open in this webview load → ask the host for the library.
    if (!state.availableSkillsLoaded) {
      vscode.postMessage({ command: 'getAvailableSkills' });
    }
    renderSkillsMenu();
    if (refs.skillsMenuSearch) {
      refs.skillsMenuSearch.value = state.skillsMenuFilter || '';
      // Defer focus to avoid being preempted by the click-outside handler.
      setTimeout(() => refs.skillsMenuSearch.focus(), 0);
    }
  }

  function closeSkillsMenu() {
    if (!refs.skillsMenu) return;
    state.skillsMenuOpen = false;
    refs.skillsMenu.classList.add('hidden');
    if (refs.skillsToggle) {
      refs.skillsToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function renderSkillsMenu() {
    if (!refs.skillsMenuList) return;
    refs.skillsMenuList.textContent = '';

    const session = activeSession();
    const active = new Set(activeSkillsOf(session));

    if (!state.availableSkillsLoaded) {
      const loading = document.createElement('div');
      loading.className = 'skills-menu-empty';
      loading.textContent = 'Carregando biblioteca...';
      refs.skillsMenuList.appendChild(loading);
      return;
    }

    if (state.availableSkills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skills-menu-empty';
      empty.textContent = 'Nenhuma skill na biblioteca. Adicione pastas em ~/.openclaude/skills.library/';
      refs.skillsMenuList.appendChild(empty);
      return;
    }

    const filter = (state.skillsMenuFilter || '').toLowerCase().trim();
    const filtered = filter
      ? state.availableSkills.filter((s) => {
          return (
            (s.id || '').toLowerCase().includes(filter) ||
            (s.name || '').toLowerCase().includes(filter) ||
            (s.description || '').toLowerCase().includes(filter)
          );
        })
      : state.availableSkills.slice();

    // Sort with active skills pinned to the top (in the order they were
    // activated), then inactive skills below in the library's natural order.
    // Snapshot taken when the menu opens — flipping a skill on/off doesn't
    // re-sort while the menu is open, only on the next open.
    const activeOrder = activeSkillsOf(session);
    filtered.sort((a, b) => {
      const aActive = active.has(a.id);
      const bActive = active.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (aActive && bActive) {
        return activeOrder.indexOf(a.id) - activeOrder.indexOf(b.id);
      }
      return 0; // preserve library order for inactive ones
    });

    if (filtered.length === 0) {
      const none = document.createElement('div');
      none.className = 'skills-menu-empty';
      none.textContent = 'Nenhuma skill bate com o filtro.';
      refs.skillsMenuList.appendChild(none);
      return;
    }

    for (const skill of filtered) {
      const isActive = active.has(skill.id);
      const item = document.createElement('div');
      item.className = 'skills-menu-item' + (isActive ? ' is-active' : '');
      item.dataset.skillId = skill.id;

      const main = document.createElement('div');
      main.className = 'skills-menu-item-main';

      const name = document.createElement('div');
      name.className = 'skills-menu-item-name';
      name.textContent = skill.name || skill.id;
      main.appendChild(name);

      if (skill.description) {
        const desc = document.createElement('div');
        desc.className = 'skills-menu-item-desc';
        desc.textContent = skill.description;
        main.appendChild(desc);
      }

      item.appendChild(main);

      // Toggle button: '✓' when active (click → remove), '+' when not (click
      // → add). Same affordance, two states. Optimistic local update so the
      // ✓ flips immediately; sessionUpdated confirms.
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'skills-menu-item-add' + (isActive ? ' active' : '');
      action.textContent = isActive ? '✓' : '+';
      action.title = isActive ? 'Remover da sessão' : 'Adicionar à sessão';
      action.addEventListener('click', () => {
        const sess = activeSession();
        if (!sess) {
          console.log('[Skill] toggle ignored — no active session');
          return;
        }
        const skillId = skill.id;
        if (isActive) {
          // REMOVE
          sess.activeSkills = activeSkillsOf(sess).filter((id) => id !== skillId);
          console.log('[Skill] remove', skillId, 'session', sess.id);
          updateSkillsBadge(sess);
          renderSkillsMenu();
          vscode.postMessage({
            command: 'removeSkill',
            sessionId: sess.id,
            skillId,
          });
          return;
        }
        // ADD
        const arr = activeSkillsOf(sess).slice();
        arr.push(skillId);
        sess.activeSkills = arr;
        console.log('[Skill] add', skillId, 'session', sess.id);
        updateSkillsBadge(sess);
        renderSkillsMenu();
        vscode.postMessage({
          command: 'addSkill',
          sessionId: sess.id,
          skillId,
        });
      });
      item.appendChild(action);

      refs.skillsMenuList.appendChild(item);
    }
  }

  if (refs.skillsToggle) {
    refs.skillsToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.skillsMenuOpen) {
        closeSkillsMenu();
      } else {
        openSkillsMenu();
      }
    });
  }

  if (refs.skillsMenuSearch) {
    refs.skillsMenuSearch.addEventListener('input', () => {
      state.skillsMenuFilter = refs.skillsMenuSearch.value || '';
      renderSkillsMenu();
    });
    refs.skillsMenuSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSkillsMenu();
      }
    });
  }

  // Click outside the menu (and not on its button) closes it.
  document.addEventListener('mousedown', (event) => {
    if (!state.skillsMenuOpen) return;
    if (refs.skillsMenu?.contains(event.target)) return;
    if (refs.skillsToggle?.contains(event.target)) return;
    closeSkillsMenu();
  });

  // Click outside the menu (and not on the button) closes it.
  document.addEventListener('mousedown', (event) => {
    if (!state.slashMenuOpen) return;
    if (refs.slashMenu.contains(event.target)) return;
    if (refs.commandsButton.contains(event.target)) return;
    if (event.target === refs.composerInput) return;
    closeSlashMenu();
  });

  // -------------------------------------------------------------------------
  // Composer (auto-grow + send)
  // -------------------------------------------------------------------------
  function autosizeTextarea() {
    if (!refs.composerInput) return;
    // The composer lives inside the chat view; when the home view is showing,
    // the chat (and the textarea) are display:none. Touching style.height in
    // that case still triggers a layout pass that briefly shifts the whole
    // shell — which is what was bouncing the bottom bar on history delete.
    if (refs.composerInput.offsetParent === null) return;
    refs.composerInput.style.height = 'auto';
    const next = refs.composerInput.value ? Math.min(refs.composerInput.scrollHeight, 200) : 32;
    refs.composerInput.style.height = next + 'px';
  }

  refs.composerInput.addEventListener('input', () => {
    autosizeTextarea();
    maybeUpdateSlashMenuFromInput();
  });

  function sendMessage() {
    const text = refs.composerInput.value.trim();
    if (!text) return;

    const session = activeSession();
    if (!session) {
      vscode.postMessage({ command: 'newChatWithMessage', text });
    } else {
      vscode.postMessage({ command: 'sendMessage', sessionId: session.id, text });
    }

    refs.composerInput.value = '';
    autosizeTextarea();
    state.stickToBottom = true;
    if (state.slashMenuOpen) closeSlashMenu();
  }

  refs.sendBtn.addEventListener('click', () => {
    if (refs.sendBtn.dataset.mode === 'stop') {
      vscode.postMessage({ command: 'stopChat', sessionId: state.activeSessionId });
    } else {
      sendMessage();
    }
  });

  refs.composerInput.addEventListener('keydown', (event) => {
    // When the slash menu is open, hijack arrow/enter/tab/escape for it.
    if (state.slashMenuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSlashFocus(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSlashFocus(-1);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = state.slashMenuFiltered[state.slashMenuFocusIndex];
        if (item) {
          event.preventDefault();
          applySlashCommand(item);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSlashMenu();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // While streaming, Enter is a no-op so we don't accidentally trigger
      // the morphed Stop button. The user has to click the square explicitly.
      const session = activeSession();
      if (session?.streaming) return;
      sendMessage();
    }
  });

  // -------------------------------------------------------------------------
  // Buttons
  // -------------------------------------------------------------------------
  // `manageProfiles` is dispatched from inside the profile combobox now
  // (renderComboboxMenu attaches the listener to the bottom "+ Editar /
  // cadastrar modelos" option) — no standalone toolbar listener.

  refs.manageSkillsBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'manageSkills' });
  });

  refs.apiKeyAlertBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'configureApiKey' });
  });

  refs.historyRefresh.addEventListener('click', () => {
    state.historyLoaded = false;
    renderHistory();
    vscode.postMessage({ command: 'refreshHistory' });
  });

  refs.startFirstChatBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'newChat' });
  });

  // Operation-mode chip switcher — distinct from permissionMode. Switching
  // rebuilds the hidden runtime, so we keep the old chip active and show a
  // spinner on the requested chip until the host confirms the new session.
  for (const btn of refs.modeBtns) {
    btn.addEventListener('click', () => {
      const session = activeSession();
      const newMode = btn.dataset.mode;
      if (!session) {
        console.log('[Mode]', newMode, '— click ignored, no active session');
        return;
      }
      session.modeSwitching = true;
      session.pendingMode = newMode;
      renderActiveSession();
      console.log('[Mode]', newMode, '(session ' + session.id + ')');
      vscode.postMessage({
        command: 'setMode',
        sessionId: session.id,
        mode: newMode,
      });
    });
  }

  // Permission mode toggle — sends control_request to the running OpenClaude
  // process via the host. We intentionally wait for the host-confirmed
  // sessionUpdated before changing the visible chip, so the UI cannot claim a
  // mode that OpenClaude rejected.
  //
  // Each button carries a distinct `data-mode` (default / acceptEdits / plan /
  // bypassPermissions). The console.log below makes it obvious which mode is
  // being dispatched so the user can verify the four buttons are not aliased.
  for (const btn of refs.permissionBtns) {
    btn.addEventListener('click', () => {
      const session = activeSession();
      const mode = btn.dataset.mode;
      if (!session) {
        console.log('[PermissionMode]', mode, '— click ignored, no active session');
        return;
      }
      console.log('[PermissionMode]', mode, '(session ' + session.id + ')');
      vscode.postMessage({
        command: 'setPermissionMode',
        sessionId: session.id,
        mode,
      });
    });
  }

  refs.thinkingToggle.addEventListener('click', () => {
    const session = activeSession();
    if (!session) {
      console.log('[Thinking] click ignored — no active session');
      return;
    }
    const next = !(refs.thinkingToggle.getAttribute('aria-pressed') === 'true');
    console.log('[Thinking]', next ? 'enabled' : 'disabled', '(session ' + session.id + ')');
    vscode.postMessage({
      command: 'setThinking',
      sessionId: session.id,
      enabled: next,
    });
  });

  // -------------------------------------------------------------------------
  // Ruflo admin surface
  // -------------------------------------------------------------------------
  function describeRufloStatus(status) {
    if (state.rufloPendingAction) return describePendingRufloAction(state.rufloPendingAction);
    if (!status) return 'Carregando status...';
    if (status.reason === 'cliMissing') return 'Ruflo ainda não foi encontrado nesta máquina.';
    if (status.reason === 'configError') return 'O Ruflo foi encontrado, mas a configuração precisa ser revisada.';
    if (status.reason === 'mcpMissing') return 'Ruflo instalado, ainda não ligado a este projeto.';
    if (status.reason === 'memoryMissing') return 'MCP pronto neste projeto, memória ainda não inicializada.';
    if (status.reason === 'daemonStopped') return 'MCP e memória prontos, daemon desligado.';
    return 'Ruflo pronto neste projeto.';
  }

  function describePendingRufloAction(action) {
    if (action === 'activateAll') return 'Ativando Ruflo neste projeto...';
    if (action === 'registerMcp') return 'Registrando MCP neste projeto...';
    if (action === 'removeMcp') return 'Removendo MCP deste projeto...';
    if (action === 'startDaemon') return 'Iniciando daemon do Ruflo...';
    if (action === 'stopDaemon') return 'Parando daemon do Ruflo...';
    if (action === 'initMemory') return 'Inicializando memória do Ruflo...';
    if (action === 'deleteMemory') return 'Apagando memória do Ruflo...';
    if (action === 'doctor') return 'Rodando diagnóstico do Ruflo...';
    return 'Atualizando Ruflo...';
  }

  function describePendingRufloPill(action) {
    if (action === 'activateAll') return 'Ruflo: ativando...';
    if (action === 'removeMcp' || action === 'stopDaemon') return 'Ruflo: desativando...';
    if (action === 'deleteMemory') return 'Ruflo: limpando...';
    return 'Ruflo: trabalhando...';
  }

  function beginRufloAction(action) {
    state.rufloPendingAction = action;
    refs.rufloStatusPill.setAttribute('data-state', 'busy');
    const label = refs.rufloStatusPill.querySelector('.ruflo-status-label');
    if (label) label.textContent = describePendingRufloPill(action);
    refs.rufloStatusPill.setAttribute('aria-busy', 'true');
    renderRufloMenu();
    renderRufloSettings();
  }

  function rufloActionButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ruflo-menu-item';
    button.role = 'menuitem';
    const isPending = state.rufloPendingAction === action;
    button.disabled = Boolean(state.rufloPendingAction);
    button.textContent = isPending ? describePendingRufloAction(action) : label;
    if (isPending) button.classList.add('is-loading');
    button.addEventListener('click', () => {
      if (state.rufloPendingAction) return;
      closeRufloMenu();
      if (action === 'settings') {
        openRufloSettings();
      } else if (action === 'refresh') {
        requestRufloStatus(true);
      } else if (action === 'openCli') {
        vscode.postMessage({ command: 'openRufloCli' });
      } else {
        beginRufloAction(action);
        vscode.postMessage({ command: 'runRufloAction', action });
      }
    });
    return button;
  }

  function renderRufloMenu() {
    if (!refs.rufloMenu) return;
    const status = state.rufloStatus;
    refs.rufloMenu.textContent = '';
    if (status?.installed && status.reason !== 'ready') {
      refs.rufloMenu.appendChild(rufloActionButton('Ativar Ruflo', 'activateAll'));
    }
    refs.rufloMenu.appendChild(rufloActionButton('Abrir configurações', 'settings'));
    refs.rufloMenu.appendChild(rufloActionButton('Reverificar status', 'refresh'));
    if (status?.installed) {
      refs.rufloMenu.appendChild(rufloActionButton('Rodar diagnóstico', 'doctor'));
    }
    refs.rufloMenu.appendChild(rufloActionButton('Abrir CLI', 'openCli'));
  }

  function openRufloMenu() {
    state.rufloMenuOpen = true;
    refs.rufloControl.dataset.open = 'true';
    refs.rufloStatusPill.setAttribute('aria-expanded', 'true');
    renderRufloMenu();
  }

  function closeRufloMenu() {
    state.rufloMenuOpen = false;
    refs.rufloControl.dataset.open = 'false';
    refs.rufloStatusPill.setAttribute('aria-expanded', 'false');
  }

  function toggleRufloMenu() {
    if (state.rufloMenuOpen) closeRufloMenu();
    else openRufloMenu();
  }

  function requestRufloStatus(force = false) {
    if (state.rufloPendingAction) return;
    refs.rufloStatusPill.setAttribute('data-state', 'checking');
    const label = refs.rufloStatusPill.querySelector('.ruflo-status-label');
    if (label) label.textContent = 'Ruflo: verificando…';
    vscode.postMessage({ command: 'getRufloStatus', force });
  }

  function applyRufloStatus(status, options = {}) {
    if (!refs.rufloStatusPill) return;
    state.rufloStatus = status;
    const preserveBusyVisual = Boolean(state.rufloPendingAction) && options.clearPending === false;
    if (!preserveBusyVisual) {
      state.rufloPendingAction = undefined;
      refs.rufloStatusPill.removeAttribute('aria-busy');
    }
    const label = refs.rufloStatusPill.querySelector('.ruflo-status-label');
    if (!status) {
      refs.rufloStatusPill.setAttribute('data-state', 'unknown');
      if (label) label.textContent = 'Ruflo: …';
      return;
    }
    let nextState;
    let nextLabel;
    if (status.reason === 'configError') {
      nextState = 'warning';
      nextLabel = 'Ruflo: revisar';
    } else if (status.reason === 'ready') {
      nextState = 'daemon';
      nextLabel = 'Ruflo: ativo';
    } else if (status.reason === 'memoryMissing') {
      nextState = 'warning';
      nextLabel = 'Ruflo: memória';
    } else if (status.mcpRegistered) {
      nextState = 'mcp';
      nextLabel = status.daemonRunning ? 'Ruflo: daemon ON' : 'Ruflo: MCP pronto';
    } else if (status.installed) {
      nextState = 'installed';
      nextLabel = 'Ruflo: instalado';
    } else {
      nextState = 'off';
      nextLabel = 'Ruflo: offline';
    }
    if (preserveBusyVisual) {
      refs.rufloStatusPill.setAttribute('data-state', 'busy');
      if (label) label.textContent = describePendingRufloPill(state.rufloPendingAction);
    } else {
      refs.rufloStatusPill.setAttribute('data-state', nextState);
      if (label) label.textContent = nextLabel;
    }
    const detail = [
      status.installed
        ? '✓ CLI instalada' + (status.version ? ' (' + status.version + ')' : '')
        : '✗ CLI não instalada',
      status.mcpRegistered ? '✓ MCP registrado no openclaude' : '✗ MCP não registrado',
      status.memoryInitialized ? '✓ Memória inicializada' : '✗ Memória não inicializada',
      status.daemonRunning ? '✓ Daemon rodando' : '✗ Daemon offline',
      status.configError ? '⚠ ' + status.configError : '',
    ].filter(Boolean).join('\n');
    refs.rufloStatusPill.setAttribute(
      'title',
      detail + '\n\nClique para abrir ações'
    );
    renderRufloMenu();
    renderRufloSettings();
  }

  if (refs.rufloStatusPill) {
    refs.rufloStatusPill.addEventListener('click', () => {
      toggleRufloMenu();
    });
    requestRufloStatus();
  }

  document.addEventListener('mousedown', (event) => {
    if (!state.rufloMenuOpen) return;
    if (refs.rufloControl.contains(event.target)) return;
    closeRufloMenu();
  });

  function openRufloSettings() {
    state.rufloSettingsOpen = true;
    render();
    requestRufloStatus(true);
  }

  function closeRufloSettings() {
    state.rufloSettingsOpen = false;
    render();
  }

  function formatRufloDetails(status) {
    if (!status) return '';
    const lines = [
      `Projeto: ${status.projectKey || status.workspaceCwd || '-'}`,
      `Configuração: ${status.configPath || '-'}`,
      status.memoryPath ? `Memória: ${status.memoryPath}` : '',
      status.mcpServerName ? `Servidor MCP: ${status.mcpServerName}` : '',
      status.cliError ? `CLI: ${status.cliError}` : '',
      status.daemonError ? `Daemon: ${status.daemonError}` : '',
      status.configError ? `Configuração: ${status.configError}` : '',
      state.rufloLastAction?.result?.message ? `Última ação: ${state.rufloLastAction.result.message}` : '',
      state.rufloLastAction?.result?.stdout ? state.rufloLastAction.result.stdout : ''
    ].filter(Boolean);
    return lines.join('\n');
  }

  function renderRufloSettings() {
    const status = state.rufloStatus;
    if (!refs.rufloSettings) return;
    const installed = Boolean(status?.installed);
    const mcpRegistered = Boolean(status?.mcpRegistered);
    const daemonRunning = Boolean(status?.daemonRunning);
    const memoryInitialized = Boolean(status?.memoryInitialized);
    const pendingAction = state.rufloPendingAction;
    refs.rufloSettingsSummary.textContent = describeRufloStatus(status);
    refs.rufloCliStatus.textContent = installed
      ? `instalada${status.version ? ' · ' + status.version : ''}`
      : 'não instalada';
    refs.rufloMcpStatus.textContent = mcpRegistered ? 'registrado' : 'não registrado';
    refs.rufloDaemonStatus.textContent = daemonRunning ? 'rodando' : 'parado';
    refs.rufloMemoryStatus.textContent = memoryInitialized ? 'inicializada' : 'não inicializada';
    refs.rufloWorkspaceStatus.textContent = status?.workspaceCwd || '-';
    refs.rufloWorkspaceName.textContent = status?.projectKey || status?.workspaceCwd || '-';
    refs.rufloWorkspaceHint.textContent = mcpRegistered
      ? 'Este projeto já está ligado ao Ruflo.'
      : installed
        ? 'Este projeto ainda não está ligado ao Ruflo.'
        : 'Instale o Ruflo antes de ligar este projeto.';
    refs.rufloDaemonSummary.textContent = daemonRunning ? 'Daemon ligado' : 'Daemon desligado';
    refs.rufloDaemonMeta.textContent = daemonRunning
      ? [
          status?.daemonPid ? `PID ${status.daemonPid}` : '',
          status?.daemonWorkersEnabled ? `${status.daemonWorkersEnabled} workers ativos` : ''
        ].filter(Boolean).join(' · ') || 'Rodando neste computador.'
      : installed
        ? 'Os workers de fundo ainda não estão rodando.'
        : 'Instale o Ruflo antes de iniciar o daemon.';
    refs.rufloMemorySummary.textContent = memoryInitialized ? 'Memória inicializada' : 'Memória não inicializada';
    refs.rufloMemoryMeta.textContent = memoryInitialized
      ? status?.memoryPath || 'Banco local pronto para este projeto.'
      : installed
        ? 'Prepare a base local usada para guardar contexto entre tarefas.'
        : 'Instale o Ruflo antes de inicializar a memória.';
    refs.rufloToggleMcpBtn.textContent = mcpRegistered
      ? 'Remover MCP deste projeto'
      : 'Registrar MCP neste projeto';
    refs.rufloToggleMcpBtn.dataset.action = mcpRegistered ? 'removeMcp' : 'registerMcp';
    refs.rufloToggleMcpBtn.classList.toggle(
      'is-loading',
      pendingAction === 'registerMcp' || pendingAction === 'removeMcp'
    );
    refs.rufloToggleMcpBtn.textContent =
      pendingAction === 'registerMcp'
        ? 'Registrando...'
        : pendingAction === 'removeMcp'
          ? 'Removendo...'
          : refs.rufloToggleMcpBtn.textContent;
    refs.rufloToggleMcpBtn.disabled = !installed || Boolean(pendingAction);
    refs.rufloToggleDaemonBtn.textContent = daemonRunning ? 'Parar daemon' : 'Iniciar daemon';
    refs.rufloToggleDaemonBtn.dataset.action = daemonRunning ? 'stopDaemon' : 'startDaemon';
    refs.rufloToggleDaemonBtn.classList.toggle(
      'is-loading',
      pendingAction === 'startDaemon' || pendingAction === 'stopDaemon'
    );
    refs.rufloToggleDaemonBtn.textContent =
      pendingAction === 'startDaemon'
        ? 'Iniciando...'
        : pendingAction === 'stopDaemon'
          ? 'Parando...'
          : refs.rufloToggleDaemonBtn.textContent;
    refs.rufloToggleDaemonBtn.disabled = !installed || Boolean(pendingAction);
    refs.rufloInitMemoryBtn.textContent = memoryInitialized ? 'Inicializada' : 'Inicializar';
    refs.rufloInitMemoryBtn.classList.toggle('is-loading', pendingAction === 'initMemory');
    if (pendingAction === 'initMemory') refs.rufloInitMemoryBtn.textContent = 'Inicializando...';
    refs.rufloInitMemoryBtn.disabled = !installed || memoryInitialized || Boolean(pendingAction);
    refs.rufloDeleteMemoryBtn.textContent = pendingAction === 'deleteMemory' ? 'Apagando...' : 'Apagar memória';
    refs.rufloDeleteMemoryBtn.classList.toggle('is-loading', pendingAction === 'deleteMemory');
    refs.rufloDeleteMemoryBtn.disabled = !installed || !memoryInitialized || Boolean(pendingAction);
    refs.rufloDoctorBtn.classList.toggle('is-loading', pendingAction === 'doctor');
    refs.rufloDoctorBtn.textContent = pendingAction === 'doctor' ? 'Diagnosticando...' : 'Rodar diagnóstico';
    refs.rufloDoctorBtn.disabled = !installed || Boolean(pendingAction);
    refs.rufloOpenCliBtn.disabled = Boolean(pendingAction);
    refs.rufloDetails.textContent = formatRufloDetails(status);
  }

  refs.closeRufloSettingsBtn.addEventListener('click', closeRufloSettings);
  refs.refreshRufloSettingsBtn.addEventListener('click', () => requestRufloStatus(true));
  refs.rufloToggleMcpBtn.addEventListener('click', () => {
    if (state.rufloPendingAction) return;
    beginRufloAction(refs.rufloToggleMcpBtn.dataset.action);
    vscode.postMessage({ command: 'runRufloAction', action: refs.rufloToggleMcpBtn.dataset.action });
  });
  refs.rufloToggleDaemonBtn.addEventListener('click', () => {
    if (state.rufloPendingAction) return;
    beginRufloAction(refs.rufloToggleDaemonBtn.dataset.action);
    vscode.postMessage({ command: 'runRufloAction', action: refs.rufloToggleDaemonBtn.dataset.action });
  });
  refs.rufloInitMemoryBtn.addEventListener('click', () => {
    if (state.rufloPendingAction) return;
    beginRufloAction('initMemory');
    vscode.postMessage({ command: 'runRufloAction', action: 'initMemory' });
  });
  refs.rufloDeleteMemoryBtn.addEventListener('click', () => {
    if (state.rufloPendingAction) return;
    beginRufloAction('deleteMemory');
    vscode.postMessage({ command: 'runRufloAction', action: 'deleteMemory' });
  });
  refs.rufloDoctorBtn.addEventListener('click', () => {
    if (state.rufloPendingAction) return;
    beginRufloAction('doctor');
    vscode.postMessage({ command: 'runRufloAction', action: 'doctor' });
  });
  refs.rufloOpenCliBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'openRufloCli' });
  });

  // -------------------------------------------------------------------------
  // Render entry point. The brand logo is inline SVG so it scales by itself
  // through viewBox + preserveAspectRatio — no JS fitting needed anymore.
  // -------------------------------------------------------------------------
  function render() {
    renderComboboxButton();
    if (state.comboboxOpen) renderComboboxMenu();
    renderTabs();
    renderHistory();
    renderActiveSession();
    autosizeTextarea();
  }

  // -------------------------------------------------------------------------
  // Host -> Webview messages
  // -------------------------------------------------------------------------
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'hydrate') {
      state.profiles = message.profiles || [];
      state.activeProfileId = message.activeProfileId;
      state.history = message.history || [];
      state.historyLoaded = true;
      state.sessions.clear();
      for (const session of message.sessions || []) {
        state.sessions.set(session.id, session);
      }
      state.activeSessionId = message.activeSessionId;
      render();
      return;
    }

    if (message.type === 'sessionCreated') {
      state.sessions.set(message.session.id, message.session);
      state.activeSessionId = message.activeSessionId;
      state.stickToBottom = true;
      render();
      return;
    }

    if (message.type === 'sessionUpdated') {
      state.sessions.set(message.session.id, message.session);
      render();
      return;
    }

    if (message.type === 'rufloStatus') {
      console.log('[Ruflo] status received', message.status);
      applyRufloStatus(message.status);
      return;
    }

    if (message.type === 'availableSkills') {
      console.log('[Skills] library received', message.skills?.length || 0, 'skills');
      state.availableSkills = Array.isArray(message.skills) ? message.skills : [];
      state.availableSkillsLoaded = true;
      // Re-render the menu if it's open so item names update from the
      // library (instead of falling back to the bare skill id).
      if (state.skillsMenuOpen) renderSkillsMenu();
      updateSkillsBadge(activeSession());
      return;
    }

    if (message.type === 'rufloActionResult') {
      state.rufloLastAction = message;
      applyRufloStatus(message.status, { clearPending: false });
      return;
    }

    if (message.type === 'sessionClosed') {
      state.sessions.delete(message.sessionId);
      state.activeSessionId = message.activeSessionId;
      render();
      return;
    }

    if (message.type === 'activeSessionChanged') {
      state.activeSessionId = message.activeSessionId;
      state.stickToBottom = true;
      render();
      return;
    }

    if (message.type === 'error') {
      const session = activeSession();
      if (session) {
        session.messages.push({
          id: 'local-error-' + Date.now(),
          role: 'error',
          text: message.text,
          final: true,
        });
        render();
      }
    }
  });

  // Initial paint with skeletons
  render();
  vscode.postMessage({ command: 'ready' });
})();

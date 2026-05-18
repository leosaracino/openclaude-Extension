const vscode = require('vscode');

const { asciiArtToSvg } = require('./utils');

function getOpenClaudeHtml(webview, extensionUri) {
  const nonce = getNonce();
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'));

  const brandLogoAscii = [
    '████████╗ ████████╗ ████████╗ ██╗  ██╗',
    '██╔═══██║ ██╔═══██║ ██╔═════╝ ███╗ ██║',
    '██║   ██║ ████████║ ██████╗   ████╗██║',
    '██║   ██║ ██╔═════╝ ██╔═══╝   ██╔████║',
    '████████║ ██║       ████████╗ ██║ ╚███║',
    '╚═══════╝ ╚═╝       ╚═══════╝ ╚═╝  ╚══╝',
    '',
    '████████╗ ██╗      ████████╗ ██╗   ██╗ ████████╗ ████████╗',
    '██╔═════╝ ██║      ██╔═══██║ ██║   ██║ ██╔═══██║ ██╔═════╝',
    '██║       ██║      ████████║ ██║   ██║ ██║   ██║ ██████╗  ',
    '██║       ██║      ██╔═══██║ ██║   ██║ ██║   ██║ ██╔═══╝  ',
    '████████╗ ████████╗██║   ██║ ╚██████╔╝ ████████║ ████████╗',
    '╚═══════╝ ╚═══════╝╚═╝   ╚═╝  ╚═════╝  ╚═══════╝ ╚═══════╝'
  ].join('\n');
  const brandLogoSvg = asciiArtToSvg(brandLogoAscii);

  return /* html */ `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <main class="shell">
    <section class="toolbar">
      <div class="combobox" id="profileCombobox" data-open="false">
        <button id="profileComboboxButton" class="combobox-button" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span id="profileComboboxLabel" class="combobox-label">Carregando perfis...</span>
          <span class="combobox-caret"><svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 5.5L8 10l4.5-4.5z"/></svg></span>
        </button>
        <div id="profileComboboxMenu" class="combobox-menu" role="listbox"></div>
      </div>
      <button id="apiKeyAlert" type="button" class="api-key-alert hidden" title="O perfil ativo está sem API key — clique para cadastrar"></button>
      <button id="manageSkills" type="button" title="Gerenciar skills e agentes">Skills</button>
      <div id="rufloControl" class="ruflo-control" data-open="false">
        <button id="rufloStatusPill" type="button" class="ruflo-status-pill" data-state="unknown" aria-haspopup="menu" aria-expanded="false" title="Status do Ruflo">
          <span class="ruflo-status-dot" aria-hidden="true"></span>
          <span class="ruflo-status-label">Ruflo: …</span>
        </button>
        <div id="rufloMenu" class="ruflo-menu" role="menu"></div>
      </div>
    </section>

    <section id="tabs" class="tabs" role="tablist" aria-label="Abas de chat"></section>

    <section class="body">
      <div id="home" class="home">
        <div class="hero">
          <div class="brand">
            <div class="brand-logo">${brandLogoSvg}</div>
            <p class="brand-tagline"><span class="brand-spark">✦</span> Any model. Every tool. Zero limits. <span class="brand-spark">✦</span></p>
          </div>
          <div class="start-chat-wrap">
            <span class="start-chat-glow" aria-hidden="true"></span>
            <button id="startFirstChat" type="button" class="primary start-chat-btn">Iniciar novo chat</button>
          </div>
        </div>
        <div class="section">
          <div class="section-header">
            <span class="section-title">Histórico recente</span>
            <button id="refreshHistory" type="button" class="ghost icon-only"></button>
          </div>
          <div id="historyList" class="history-list"></div>
        </div>
      </div>

      <div id="chat" class="chat hidden">
        <div id="messages" class="messages" role="log" aria-live="polite"></div>
        <div class="chat-controls" role="group" aria-label="Configurações do chat">
          <div class="chat-control-group mode-group" role="radiogroup" aria-label="Quem responde">
            <button type="button" class="mode-btn" data-mode="single" title="Chat normal — um único LLM responde">Single</button>
            <button type="button" class="mode-btn mode-btn-ruflo" data-mode="swarm" title="Swarm Ruflo — o LLM usa as MCP tools do Ruflo para orquestrar agentes especializados em paralelo">Swarm</button>
          </div>
          <div class="chat-control-group" role="radiogroup" aria-label="Modo de permissão">
            <button type="button" class="permission-btn" data-mode="default" title="Pergunta antes de qualquer ação que toque arquivo ou shell">Default</button>
            <button type="button" class="permission-btn" data-mode="acceptEdits" title="Aceita edição de arquivo automaticamente, ainda pergunta para shell">Accept</button>
            <button type="button" class="permission-btn" data-mode="plan" title="Modo planejamento — só analisa e propõe plano, não executa">Plan</button>
            <button type="button" class="permission-btn permission-btn-danger" data-mode="bypassPermissions" title="Aceita tudo sem perguntar (perigoso)">Bypass</button>
          </div>
          <div class="chat-controls-right">
            <button type="button" id="commandsButton" class="commands-button" aria-haspopup="listbox" aria-expanded="false" title="Ver comandos disponíveis (/)"></button>
            <button type="button" id="skillsToggle" class="skills-toggle" aria-haspopup="listbox" aria-expanded="false" title="Adicionar skills a esta sessão">
              <span class="skills-toggle-icon" aria-hidden="true">+</span>
              <span>Skills</span>
              <span id="skillsToggleBadge" class="skills-toggle-badge hidden" aria-hidden="true">0</span>
            </button>
            <button type="button" id="thinkingToggle" class="thinking-toggle" aria-pressed="false" title="Ativa/desativa raciocínio extra">
              <span class="thinking-toggle-dot" aria-hidden="true"></span>
              <span>Thinking</span>
            </button>
          </div>
        </div>
        <div class="composer-area">
          <div id="slashMenu" class="slash-menu hidden" role="listbox" aria-label="Comandos do OpenClaude"></div>
          <div id="skillsMenu" class="skills-menu hidden" role="listbox" aria-label="Biblioteca de skills">
            <div class="skills-menu-header">
              <span class="skills-menu-title">Adicionar skill à sessão</span>
              <input id="skillsMenuSearch" class="skills-menu-search" type="text" placeholder="Filtrar..." aria-label="Filtrar skills" />
            </div>
            <div id="skillsMenuList" class="skills-menu-list"></div>
          </div>
          <section class="composer">
            <div class="composer-input-wrap">
              <textarea id="composerInput" placeholder="Escreva para o OpenClaude... (ou /comando)" rows="1" aria-label="Mensagem"></textarea>
              <span class="composer-hint">Enter envia · Shift+Enter quebra linha · / para comandos</span>
            </div>
            <button id="sendMessage" type="button" class="send-button" aria-label="Enviar"></button>
          </section>
        </div>
      </div>

      <div id="rufloSettings" class="ruflo-settings hidden">
        <div class="ruflo-settings-header">
          <div>
            <h2>Ruflo</h2>
            <p id="rufloSettingsSummary">Carregando status...</p>
          </div>
          <button id="closeRufloSettings" type="button" class="ghost icon-only" aria-label="Fechar configurações"></button>
        </div>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Estado</span>
            <button id="refreshRufloSettings" type="button" class="ghost icon-only" aria-label="Atualizar Ruflo"></button>
          </div>
          <div class="ruflo-status-grid">
            <div class="ruflo-status-row">
              <span>CLI</span>
              <strong id="rufloCliStatus">-</strong>
            </div>
            <div class="ruflo-status-row">
              <span>MCP deste projeto</span>
              <strong id="rufloMcpStatus">-</strong>
            </div>
            <div class="ruflo-status-row">
              <span>Daemon</span>
              <strong id="rufloDaemonStatus">-</strong>
            </div>
            <div class="ruflo-status-row">
              <span>Memória</span>
              <strong id="rufloMemoryStatus">-</strong>
            </div>
            <div class="ruflo-status-row">
              <span>Workspace</span>
              <strong id="rufloWorkspaceStatus">-</strong>
            </div>
          </div>
        </section>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Projeto atual</span>
          </div>
          <div class="ruflo-settings-panel">
            <div>
              <strong id="rufloWorkspaceName">-</strong>
              <span id="rufloWorkspaceHint">Carregando estado do MCP...</span>
            </div>
            <button id="rufloToggleMcp" type="button"></button>
          </div>
        </section>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Daemon</span>
          </div>
          <div class="ruflo-settings-panel">
            <div>
              <strong id="rufloDaemonSummary">-</strong>
              <span id="rufloDaemonMeta">Carregando estado do daemon...</span>
            </div>
            <button id="rufloToggleDaemon" type="button"></button>
          </div>
        </section>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Memória</span>
          </div>
          <div class="ruflo-settings-panel">
            <div>
              <strong id="rufloMemorySummary">-</strong>
              <span id="rufloMemoryMeta">Carregando estado da memória...</span>
            </div>
            <div class="ruflo-settings-actions">
              <button id="rufloInitMemory" type="button">Inicializar</button>
              <button id="rufloDeleteMemory" type="button" class="danger">Apagar memória</button>
            </div>
          </div>
        </section>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Ferramentas</span>
          </div>
          <div class="ruflo-actions">
            <button id="rufloDoctor" type="button">Rodar diagnóstico</button>
            <button id="rufloOpenCli" type="button">Abrir CLI</button>
          </div>
        </section>

        <section class="ruflo-settings-section">
          <div class="section-header">
            <span class="section-title">Detalhes</span>
          </div>
          <div id="rufloDetails" class="ruflo-details"></div>
        </section>
      </div>
    </section>
  </main>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

module.exports = {
  getOpenClaudeHtml
};

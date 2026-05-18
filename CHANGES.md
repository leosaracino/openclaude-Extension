# CHANGES — Sessão de melhorias visuais e correções

**Data:** 2026-05-14
**Escopo:** extensão `leonardo.openclaude-tools-0.0.1` instalada em
`C:\Users\Leonardo\.vscode\extensions\leonardo.openclaude-tools-0.0.1`.
Não há repositório-fonte separado neste momento — todas as edições foram feitas
diretamente no bundle instalado.

---

## Resumo do diagnóstico (Fase 1)

Lendo `extension.js`, `media/webview.css` e `media/webview.js` antes de qualquer
edit, dois achados mudaram o plano:

1. **Bugs 3.3 (painel de comandos abre fora de visão) e 3.4 (autocomplete `/`
   não funciona) são o mesmo bug.** O `.slash-menu` já está posicionado
   corretamente para subir acima do composer (`position: absolute; bottom: calc(100% - 4px)`),
   o JS de filtro e abertura está completo e funcional — mas o pai
   `.composer-area` tinha `overflow: hidden`, que cortava o menu e o tornava
   invisível. Um único fix CSS resolve os dois sintomas.
2. **Bug 3.1 (toggle Thinking não dá feedback).** O backend e o CSS já estavam
   corretos (`.thinking-toggle[aria-pressed='true']` existe e usa a paleta
   sunset). O sintoma "não acontece nada" vinha de o `aria-pressed` só ser
   atualizado depois do round-trip host→webview. Adicionei update otimista no
   click.

Cores hardcoded restantes no CSS após a inspeção: apenas `#fff` em 2 botões
sunset (substituível por `var(--vscode-button-foreground, #fff)`) e as paletas
verdes/vermelhas/cinzas dos botões de Approve/Deny/Suggest. O resto do CSS já
estava bem encadeado com variáveis VSCode + design tokens em `:root`.

---

## Arquivos alterados

### `media/webview.css`

| Linhas (aprox.) | O que mudou | Por quê |
|---|---|---|
| 77–78 | `body { width: 100vw → 100%; height: 100vh → 100% }` | **Fase 2.3.** Em webviews, `100vw` inclui largura de scrollbar e pode gerar overflow horizontal de 1-2px ao redimensionar a sidebar. `100%` ancora ao container pai (fornecido pelo VSCode). |
| ~578 | `.start-chat-btn { color: #fff → var(--vscode-button-foreground, #fff) }` | **Fase 2.1.** Última cor hardcoded fora da paleta sunset proposital. Fallback mantém branco para temas que não definem a variável. |
| ~1214 | `.viewer-banner-cta { color: #fff → var(--vscode-button-foreground, #fff) }` | **Fase 2.1.** Idem. |
| ~1376–1422 | Bloco `.permission-actions .permission-approve / .permission-deny / .permission-suggest` (e :hover): cores hex saturadas (`#2f5f42`, `#7d3e3e`, `#a7adb4`…) → tons pastel `hsl(...)` + `opacity: 0.85` normal / `1` no hover. Texto usa `var(--vscode-button-foreground, ...)` com fallback. | **Fase 2.4.** Pastéis WCAG-AA pedidos: verde `hsl(142, 35%, 50%)`, vermelho `hsl(0, 35%, 55%)`, azul-cinza `hsl(210, 22%, 60%)`. |
| ~1594 | `.composer-area`: removido `overflow: hidden` (deixei comentário explicando o porquê). | **Fase 3.3 + 3.4 (bug único).** Esse overflow:hidden estava clipando o `.slash-menu`, que sobe via `bottom: calc(100% - var(--space-1))`. Sem o overflow, o menu agora aparece acima do input ao digitar `/` ou clicar no botão de comandos. |

### `media/webview.js`

| Linhas (aprox.) | O que mudou | Por quê |
|---|---|---|
| ~1267–1283 | Handler `refs.thinkingToggle.addEventListener('click', ...)`: agora faz update otimista de `aria-pressed` e do `session.thinkingEnabled` antes de postar a mensagem ao host, e emite `console.log('[Thinking]', ...)`. | **Fase 3.1.** O CSS para `[aria-pressed='true']` já existia (linhas ~1542-1551, usando `--oc-sun-2`). O bug era percepção: o `aria-pressed` só era atualizado quando o host respondia com `sessionUpdated`, dando a sensação de toggle morto. Update otimista resolve. |
| ~1255–1283 | Handler do loop sobre `refs.permissionBtns`: agora atualiza `session.permissionMode` localmente, sincroniza a classe `.active` entre os 4 botões e emite `console.log('[PermissionMode]', mode, ...)`. | **Fase 3.2.** Cada botão (`default`, `acceptEdits`, `plan`, `bypassPermissions`) tem `data-mode` distinto e já chamava o handler com o mode certo — o backend (`extension.js:2095`) também trata cada modo separadamente via `set_permission_mode` control_request. Com o log no console fica fácil auditar no DevTools se os 4 estão de fato dispatchando modos diferentes; o update otimista da `.active` dá feedback visual instantâneo. |
| ~1126–1135 | Handler `refs.commandsButton.addEventListener('click', ...)`: agora emite `console.log('[CommandsMenu] open/close')`. | **Fase 3.3.** Para validar via DevTools que o botão dispara abertura/fechamento — útil agora que o menu finalmente é visível. |

### Raiz da extensão

- **Removidos** (autorizados pelo usuário): `extension.js.codex-backup-20260502-155606`, `…-20260502-165246`, `…-20260502-170213`, `…-openai-env-20260503-155042`, `package.json.codex-backup-20260502-165246`, `package.json.codex-backup-20260502-170213`. Todos eram versões antigas do bundle (4KB–22KB vs. atual de 116KB) — não serviam de contexto para essa sessão.
- **Criados:** `RESEARCH.md` (Fase 0 — integração Ruflo), `CHANGES.md` (este arquivo).

---

## Rodada 2 — Ajustes pedidos após primeiro feedback

Você reportou três sintomas remanescentes após o primeiro round: (a) "cor padrão"
da extensão não muda com o tema do VSCode, (b) cores dos botões pastel ainda
fixas, (c) extensão não alinha com o bottom da sua custom UI (sidebar direita).
Diagnóstico e fixes:

### `media/webview.css` — `.shell` (linhas ~206-219)

**Antes:**
```css
.shell {
  ...
  padding: 6px 8px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg) 92%, var(--text) 8%);
}
```

**Depois:**
```css
.shell {
  ...
  padding: 6px 6px 0 6px;
  /* sem border, sem border-radius, sem background */
  background: transparent;
}
```

**Por quê:**
- `color-mix(... var(--bg) 92%, var(--text) 8%)` misturava bg+texto e produzia
  um cinza neutro **independente do tema** — daí a sensação de "cor fixa".
  Removido. Agora a `.shell` é transparente e a sidebar do VSCode pinta direto
  → muda automaticamente em Dark, Light e High Contrast.
- `border` + `border-radius` + `padding-bottom: 8px` criavam uma "ilha"
  retangular flutuando dentro da sidebar. Em sidebars com custom UI (Apc
  Customize, Island Dark) que pintam o painel com cantos arredondados
  próprios, sua "ilha" interna NÃO alinhava com o bottom do painel externo.
  Removidos. Agora o composer encosta no fundo da sidebar.
- Padding-top e laterais reduzidos para 6px (era 6/8/8) para dar um respiro
  mínimo sem afastar o conteúdo das bordas.

### `media/webview.css` — botões de permission (linhas ~1375–1420)

**Antes:** `background: hsl(142, 35%, 50%)` etc. — HSL fixo, não seguia tema.

**Depois:** `background: color-mix(in srgb, var(--vscode-testing-iconPassed, hsl(142, 50%, 50%)) 55%, transparent)`. Hover usa a variável "pura" (sem mix).

**Por quê:** A tarefa original aceitava duas alternativas — HSL pastel **ou**
`var(--vscode-testing-iconPassed/Failed)` + opacidade. Você confirmou que quer
a segunda opção (seguir tema), então:
- Approve → `var(--vscode-testing-iconPassed, hsl(142, 50%, 50%))`
- Deny → `var(--vscode-testing-iconFailed, hsl(0, 50%, 55%))`
- Suggest → `var(--vscode-badge-background, hsl(210, 22%, 60%))`

O `color-mix` com 55-70% de opacidade gera o efeito pastel a partir da cor que
o tema escolheu. Texto usa `var(--vscode-button-foreground)` /
`var(--vscode-badge-foreground)` para manter contraste em qualquer tema.

### Como verificar (rodada 2)

1. **Reload Window** no VSCode (`Ctrl+Shift+P` → `Developer: Reload Window`).
   Sem isso, o webview ainda mostra a CSS antiga em cache.
2. Troque entre Dark+ e Light+ (`Ctrl+K Ctrl+T`). A extensão agora deve mudar
   de cor de fundo junto com a sidebar — não tem mais cinza neutro fixo.
3. O composer (área de digitar) deve agora estar **encostado no fundo** da
   sidebar, sem espaço extra.
4. Provoque um prompt de permissão (peça pro Claude editar um arquivo em modo
   `Default`). Os botões Approve/Deny/Suggest agora devem aparecer com tom
   pastel **derivado do seu tema** — em temas escuros o pastel é escuro,
   em claros é claro.

---

## Rodada 3 — Alinhamento total com a sidebar (sem "ilha")

Você perguntou por que existe "ilha" e se outras extensões fazem isso. Resposta
curta: **não fazem.** Cline, Continue, Roo, Copilot Chat renderizam conteúdo
flush nos limites do iframe que o VSCode aloca. O Open Claude tinha 3 caixas
internas com `border` + `border-radius` que criavam o efeito de cards
empilhados ("ilhas"):

1. `.toolbar` (linha ~228) — caixa arredondada no topo
2. `.body` (linha ~476) — caixa grande do chat
3. `.composer` (linha ~1697) — caixa arredondada na base

Todas removidas. Agora a estrutura segue o padrão das outras extensões:

### `media/webview.css` — alterações desta rodada

| Seletor | Antes | Depois | Por quê |
|---|---|---|---|
| `.shell` | `padding: 6px 6px 0 6px; gap: 6px` | `padding: 0; gap: 0` | Conteúdo encosta nas bordas da sidebar; dividers passam a ser feitos pelos filhos. |
| `.toolbar` | `border: 1px solid; border-radius: var(--radius-lg); background: var(--panel)` | `border-bottom: 1px solid; background: var(--panel)` | Vira uma faixa horizontal flush, com separador visual via border-bottom. Mantém background levemente destacado para parecer "header". |
| `.body` | `border: 1px solid; border-radius; background: var(--bg-soft)` | `background: transparent` | A sidebar do VSCode (ou a custom UI do seu tema) pinta o fundo direto. Em qualquer tema. |
| `.composer` | `border: 1px solid; border-radius: 0 0 10px 10px; box-shadow: var(--shadow-sm)` | `border: none; border-top: 1px solid; border-radius: 0` (sem box-shadow) | Sem cantos arredondados nem sombra. Linha de cima como divisor; bottom encosta no fundo da sidebar. |

### Como verificar

1. Reload (`Ctrl+Shift+P` → `Developer: Reload Window`).
2. A extensão agora deve ocupar 100% da largura/altura da sidebar direita —
   sem caixinhas internas, sem cantos arredondados internos.
3. Se você tem custom UI (Apc Customize / Island Dark / tema com painéis
   arredondados): os cantos do painel externo são os únicos visíveis. O
   composer encosta no bottom-right rounded corner que seu tema desenha.
4. Os 3 separadores horizontais ainda existem (linha fina entre toolbar/body,
   entre messages/chat-controls, entre chat-controls/composer) — eles dão
   estrutura sem criar caixas.

---

## Rodada 4 — Safe area no bottom (histórico vazando)

Após a Rodada 3, você reportou que a lista de histórico recente "foge para
baixo" da custom UI. Duas causas combinadas:

1. **Altura do `.body` colapsando.** Quando removi o `border` + `background`
   do `.body` na Rodada 3, ele ficou sem altura explícita. O grid track da
   `.shell` continuava dando espaço, mas filhos com `height: 100%` (`.home`,
   `.chat`) não tinham referência de altura — então o conteúdo do `.home`
   esticava além do espaço visível.
2. **Áreas de scroll esbarrando no canto arredondado da custom UI.** Mesmo
   com a altura correta, as áreas roláveis (`.home` e `.messages`)
   terminavam pixel-perfeito no fundo da sidebar — onde sua custom UI
   pinta o canto arredondado, escondendo os últimos itens.

### `media/webview.css` — alterações desta rodada

| Seletor | Mudança | Por quê |
|---|---|---|
| `.body` (linha ~476) | Adicionado `height: 100%` | Dá referência explícita para `height: 100%` em `.home` e `.chat`. Sem isso, o conteúdo do home crescia além do iframe e a custom UI cortava o final. |
| `.home` (linha ~490) | `padding-bottom: calc(var(--space-5) + 16px)` (= 36px) | Safe area que mantém os últimos itens do histórico visíveis e roláveis, sem deslizar para trás do canto arredondado da custom UI. |
| `.messages` (linha ~799) | `padding-bottom: calc(var(--space-2) + 8px)` (= 16px) | Safe area menor (8px extra) porque abaixo da área de mensagens já vem `.chat-controls` + `.composer` que cobrem o canto arredondado. |

O composer continua encostando no bottom da sidebar (ele não rola; está
sempre na mesma posição), e as áreas que rolam têm folga para a custom UI.

### Como verificar

1. Reload (`Ctrl+Shift+P` → `Developer: Reload Window`).
2. Sem chat aberto, a lista de histórico no `.home` deve mostrar todos os
   itens — role para o final e o último item deve aparecer **completo**,
   acima do canto arredondado da sua custom UI.
3. Em um chat com muitas mensagens, a última bubble também deve aparecer
   inteira (mesmo que precise rolar) sem ser cortada pelo bottom.
4. O composer continua flush, sem espaço extra entre ele e o bottom da
   sidebar.

---

## Rodada 5 — Integração Ruflo (Fase 0 + Fase 1 + Fase Bônus)

Início da integração com o Ruflo (https://github.com/ruvnet/ruflo). Esta rodada
entrega: detector de ambiente, chip switcher de modo operacional, e botão
para abrir o Ruflo CLI no terminal integrado. Fases 2 (catálogo de agentes),
3 (live view do swarm) e 4 (onboarding completo + ações no pill) ficam para
as próximas sessões.

### Fase 0 — Detector de ambiente Ruflo

**Backend (`extension.js`):**
- `require('child_process').exec` + `util.promisify` adicionados aos imports.
- Novo método `async checkRufloEnvironment(options)` na classe
  `OpenClaudeViewProvider`. Probes (todos com timeout, tolerantes a falha):
  1. `npx ruflo@latest --version` → flag `installed` + `version`
  2. `<openclaude> mcp list` → procura `\bruflo\b` no stdout → flag `mcpRegistered`
  3. `npx ruflo@latest daemon status` → procura `running|started|up|active|on` → flag `daemonRunning`
- Cache de 30s no `this.rufloStatusCache` para não spawnar `npx` em cada hydrate.
- Novo handler `getRufloStatus` no `handleWebviewMessage` — responde com
  `{ type: 'rufloStatus', status: { installed, version, mcpRegistered, daemonRunning, checkedAt } }`.

**UI (`extension.js` + `media/webview.css` + `media/webview.js`):**
- Pill `#rufloStatusPill` adicionado ao toolbar, após "Skills". 4 estados visuais
  pelo `data-state`:
  - `unknown` / `off` → dot cinza
  - `installed` → dot amarelo (warn)
  - `mcp` → dot azul (accent)
  - `daemon` → dot verde (ok) com glow
  - `checking` → dot pulsando enquanto re-detecta
- Clique no pill força um re-check (cache busted via `force: true`).
- Tooltip detalhado mostra `✓ CLI instalada (versão) · ✓ MCP registrado · ✓ Daemon rodando`.
- Auto-fetch no carregamento inicial do webview.

### Fase 1 — Chip switcher de Modo operacional

**Conceito:** "modo" é WHO responde (ortogonal ao `permissionMode` que define
COMO o respondedor age). Três modos:
- `default` — single LLM, chat normal
- `plan` — single LLM, planejando (acoplado a `permissionMode='plan'`)
- `ruflo` — prompt é prefixado para nudge o LLM a usar tools do MCP Ruflo

**Backend (`extension.js`):**
- Constantes `SESSION_MODES`, `DEFAULT_SESSION_MODE` e `RUFLO_PROMPT_PREFIX`
  adicionadas perto de `PERMISSION_MODES`.
- Campo `session.mode` inicializado em createSession e openViewerSession.
- `serializeSession` agora inclui `mode` (com fallback para
  `DEFAULT_SESSION_MODE` em sessões legadas).
- Novo método `setSessionMode(sessionId, mode)`:
  - Valida contra `SESSION_MODES`.
  - Aplica regra implícita: `plan` força `permissionMode='plan'`;
    `ruflo` tira do `plan` para `acceptEdits` se estiver lá.
- Novo handler `setMode` no `handleWebviewMessage`.
- `sendUserMessage` agora prefixa o `content` enviado ao LLM com
  `RUFLO_PROMPT_PREFIX` quando `session.mode === 'ruflo'`. O prefixo NÃO
  aparece no transcript da UI — só na payload stdin do CLI.

**UI:**
- Novo `chat-control-group.mode-group` adicionado **antes** do group de
  permission (linha ~3444 do `extension.js`). Três botões `.mode-btn`:
  Default · Plan · Ruflo (último carrega classe `.mode-btn-ruflo` para
  pintar com a paleta sunset quando ativo).
- `webview.js`: novo ref `modeBtns`, listener com update otimista da `.active`,
  `console.log('[Mode]', mode, ...)` e dispatch `setMode` ao host.
- `renderActiveSession` agora sincroniza a `.active` dos `modeBtns` a partir
  de `session.mode`.
- `webview.css`: estilos para `.mode-btn`, `.mode-btn.active` e
  `.mode-btn-ruflo.active` (variante sunset).

### Fase Bônus — Botão "Ruflo CLI" (terminal integrado)

**Por quê:** Embedar o Ruflo CLI inteiro dentro da webview (como `openclaude`
faz) exigiria que o `ruflo` tenha um modo `--json-stdio` headless, o que não
está documentado. Solução pragmática: abrir o CLI em terminal integrado do
VSCode, com env vars do profile ativo já injetadas. Resultado: 100% das
funcionalidades da CLI disponíveis, autenticadas com a API key que o usuário
já cadastrou.

**Backend (`extension.js`):**
- Novo método `async openRufloCli()`:
  1. Pega o profile ativo + secret via `profileStore`
  2. Pede API key se faltar (toast nativa: "Cadastrar"/"Cancelar")
  3. Chama `this.buildEnv(profile, apiKey)` para reusar o mesmo provider env
     que o openclaude usa
  4. Sanitiza valores não-string (createTerminal exige strings)
  5. `vscode.window.createTerminal({ name: 'Ruflo CLI', cwd, env })`
  6. `terminal.sendText('npx ruflo@latest', true)` + `terminal.show()`
- Novo handler `openRufloCli` no `handleWebviewMessage`.
- Novo comando `leonardo.openRufloCli` registrado em `activate()`.

**UI:**
- Botão `#openRufloCli` adicionado ao toolbar (entre "Skills" e o pill de status).
- `webview.js`: ref `openRufloCliBtn` + listener que dispara `openRufloCli` ao host.

**Manifest (`package.json`):**
- `activationEvents` ganhou `onCommand:leonardo.openRufloCli`
- `contributes.commands` ganhou entrada com título "Abrir Ruflo CLI no terminal"
  e ícone `$(terminal)`
- `contributes.menus.commandPalette` ganhou entrada para o comando

### Como verificar (rodada 5)

1. **Reload Window** (`Ctrl+Shift+P` → `Developer: Reload Window`).
2. **Status pill**: no toolbar, à direita de "Skills", aparece o pill "Ruflo: …"
   piscando enquanto detecta. Depois assume um dos 4 estados (offline /
   instalado / MCP / daemon) conforme o que estiver disponível. Hover mostra
   detalhes. Click força re-check.
3. **Chip switcher de modo**: em qualquer chat ativo, há um novo grupo de
   chips acima das chips de permissão. Clique em "Ruflo" — o chip pega o
   tom sunset e o console mostra `[Mode] ruflo (session …)`.
4. **Modo Ruflo em ação**: com chip Ruflo selecionado, mande qualquer
   prompt. No DevTools você não verá o prefixo (ele só vai no stdin do
   openclaude), mas se o MCP Ruflo estiver registrado, o LLM principal
   deve começar a chamar tools do tipo `swarm_init`, `agent_spawn`, etc.
5. **Ruflo CLI**: clique no botão "Ruflo CLI" do toolbar. Abre um terminal
   integrado novo chamado "Ruflo CLI" com `npx ruflo@latest` rodando — já
   autenticado com a API key do seu profile ativo. Funciona inclusive para
   Gemini/OpenAI/Mistral/etc., porque `buildEnv` injeta o env do provider
   escolhido.
6. **Command Palette**: `Ctrl+Shift+P` → "Abrir Ruflo CLI no terminal" também
   funciona como atalho.

### Próximas fases (não nesta rodada)

- **Fase 2** — Catálogo de agentes: ao mandar prompt em Modo Ruflo,
  intercepta o envio e mostra um catálogo inline (Researcher / Coder /
  Reviewer / Tester / Architect / Security…) com checkboxes; "Confirmar"
  envia com a lista escolhida.
- **Fase 3** — Live view do swarm: agrupar cards de `tool_use` por agente
  (Coder / Reviewer / …) com cores diferenciadas, contador de tokens e
  botão "Pausar swarm".
- **Fase 4** — Onboarding rico no pill: clique abre menu com ações
  "Instalar Ruflo" / "Registrar MCP no openclaude" / "Iniciar daemon" para
  resolver os estados offline automaticamente.

---

## Rodada 6 — Hotfix: nome real do pacote npm + shell Windows

Reportado após Rodada 5: pill marcava "Ruflo instalado" (falso positivo) e
o terminal "Ruflo CLI" falhava com `npm error code ERR_INVALID_URL` rodando
em WSL.

### Diagnóstico

1. **Pacote npm não se chama `ruflo`.** Conforme o `CLAUDE.md` global do
   próprio usuário, o pacote real é **`@claude-flow/cli`**. "Ruflo" é o
   nome de marca/produto, mas o publish no npm registry usa o nome
   `@claude-flow/cli`. Por isso `npx ruflo@latest` falhava com Invalid URL.
2. **Falso positivo no detector**: o `trimString(stdout)` aceitava qualquer
   output não-vazio como "instalado", incluindo o chatter do npx
   `installing 1 packages...` que aparece antes da falha real.
3. **Terminal default WSL**: o usuário usa WSL como integrated terminal
   default. Ao abrir o terminal "Ruflo CLI" via `createTerminal({ env })`,
   o VSCode entregava o env Windows pro bash do WSL — que ignora paths
   Windows e usa o `npm` do Linux interno, diferente do que o detector
   usa.

### `extension.js` — alterações

| Trecho | Antes | Depois |
|---|---|---|
| `checkRufloEnvironment` probe 1 | `npx ruflo@latest --version` | `npx -y @claude-flow/cli@latest --version` |
| Validação do output do probe 1 | aceita qualquer stdout não-vazio | exige regex `\d+\.\d+(?:\.\d+)?` (algo que pareça versão) |
| Timeout do probe 1 | 8s | 15s (primeira execução baixa o pacote) |
| `checkRufloEnvironment` probe 2 | regex `\bruflo\b` | regex `\b(ruflo|claude-flow)\b` (aceita ambos os nomes no `mcp list`) |
| `checkRufloEnvironment` probe 3 | `npx ruflo@latest daemon status` | `npx -y @claude-flow/cli@latest daemon status` (timeout 8s) |
| `openRufloCli` comando rodado | `npx ruflo@latest` | `npx -y @claude-flow/cli@latest` |
| `openRufloCli` shell do terminal | default (WSL no usuário) | força `cmd.exe` no Windows (`process.env.ComSpec`) |

### Como verificar

1. Reload Window.
2. Pill deve agora ou:
   - dizer "Ruflo: offline" se `@claude-flow/cli` não estiver baixável
   - dizer "Ruflo: instalado" + versão real (ex.: "Ruflo: instalado 2.5.x")
3. Clicar "Ruflo CLI" abre um terminal **cmd.exe** (Windows nativo) rodando
   `npx -y @claude-flow/cli@latest`. Primeira invocação baixa o pacote via
   npm — pode demorar 30s. Próximas são instantâneas.
4. Se quiser registrar o MCP no openclaude (pra Modo Ruflo funcionar):
   ```cmd
   openclaude mcp add claude-flow -- npx -y @claude-flow/cli@latest mcp start
   ```
   Depois reload + click no pill pra re-check → deve subir pra "Ruflo: MCP ativo".

---

## Rodada 7 — Hotfix: bin name correto do `@claude-flow/cli`

Reportado após Rodada 6: o download do pacote agora funciona, mas termina com
`'cli' não é reconhecido como um comando interno ou externo`.

### Diagnóstico

`npx -y @claude-flow/cli@latest` infere o nome do bin do **último segmento**
do pacote (= `cli`). Mas o pacote `@claude-flow/cli` registra um binário
chamado **`claude-flow`** no campo `bin` do `package.json` dele. Por isso o
npx baixa tudo certo e depois falha ao tentar executar `cli` (que não
existe).

Bonus: warnings `npm warn tar TAR_ENTRY_ERROR ENOENT` e `npm warn cleanup
ENOTEMPTY` são problemas da subdependência `agentic-flow` em paths longos no
Windows. Inofensivos pro funcionamento, mas chatos. Workarounds:
- Habilitar Long Paths no Windows
  (`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`)
- Mover o cache npm pra um path curto: `npm config set cache C:\npm-cache`
- Limpar e re-baixar: `npm cache clean --force`

### `extension.js` — alterações

| Trecho | Antes | Depois |
|---|---|---|
| `checkRufloEnvironment` probe 1 (instalação) | `npx -y @claude-flow/cli@latest --version` | `npx -y -p @claude-flow/cli@latest claude-flow --version` |
| `checkRufloEnvironment` probe 3 (daemon) | `npx -y @claude-flow/cli@latest daemon status` | `npx -y -p @claude-flow/cli@latest claude-flow daemon status` |
| Timeout do probe 1 | 15s | 20s (1ª execução pode ser lenta) |
| Timeout do probe 3 | 8s | 10s |
| `openRufloCli` comando do terminal | `npx -y @claude-flow/cli@latest` | `npx -y -p @claude-flow/cli@latest claude-flow` |

### Recomendação de instalação global (opcional, evita re-download)

```cmd
npm install -g @claude-flow/cli
```

Depois disso, `claude-flow` fica disponível direto na PATH. A extensão
continua usando `npx -p` (que detecta a versão global se houver, ou baixa
sob demanda), então não muda nada do lado dela — mas o terminal abre
instantâneo em vez de baixar todo vez.

---

## Rodada 8 — PATH do npm global + UX do botão Ruflo CLI

Após Rodada 7 + install global, o `claude-flow --version` retornava
`ruflo v3.7.0-alpha.42` no terminal manual, mas o pill da extensão continuava
"offline" e o botão "Ruflo CLI" abria o terminal, mostrava help e parecia
encerrar (na verdade voltava ao prompt do cmd).

### Diagnósticos

1. **PATH herdado pelo Node child do VSCode** não inclui
   `C:\Users\Leonardo\AppData\Roaming\npm`. O `execAsync('claude-flow ...')`
   falhava porque `claude-flow.cmd` não estava na PATH visível ao processo
   spawnado pela extensão — mesmo estando instalado globalmente.
2. **`claude-flow` não é um chat interativo** — é uma toolkit com
   subcomandos (`init`, `status`, `agent spawn`, `mcp start`, `doctor`…).
   Rodá-lo sem argumentos mostra o help e volta ao prompt. Comportamento
   correto, UX confusa do meu lado.

### `extension.js` — alterações

| Trecho | Antes | Depois |
|---|---|---|
| `checkRufloEnvironment` — descoberta da CLI | Sempre via `npx -p` (lento, baixa rede) | Tenta `claude-flow --version` direto primeiro com **PATH expandido** (`%APPDATA%\npm` prepended); só cai pra npx se direto falhar |
| `checkRufloEnvironment` — daemon status | Idem npx-only | Mesmo padrão direct-first / npx-fallback |
| `openRufloCli` — comando inicial do terminal | `npx -y -p @claude-flow/cli@latest claude-flow` (mostrava help e voltava ao prompt) | `claude-flow doctor` (diagnóstico útil do ambiente + providers + MCP status) |
| `openRufloCli` — PATH do terminal | Default | Prepende `%APPDATA%\npm` à PATH do terminal pra `claude-flow.cmd` ficar acessível |

### Como verificar

1. Reload Window.
2. Pill deve mudar pra **"Ruflo: instalado 3.7.0-alpha.42"** (verde-âmbar).
3. Click no botão "Ruflo CLI": abre cmd.exe → roda `claude-flow doctor` → mostra
   diagnóstico do ambiente. O prompt **fica aberto** depois — você digita
   `claude-flow --help` ou qualquer subcomando que quiser.

---

## Rodada 9 — Probe do MCP per-project

Após Rodada 8, pill subiu pra "Ruflo: instalado". User rodou
`openclaude mcp add claude-flow -- claude-flow mcp start` com sucesso, mas o
pill continuou amarelo — não mudou pra azul ("MCP ativo").

### Diagnóstico

O output do `mcp add` deu a dica:
```
File modified: C:\Users\Leonardo\.claude.json [project: D:\TCC_oficial\TCC-MOTIVA-APP]
```

O openclaude registra MCP servers **per-project**, escopados pelo cwd onde
o comando rodou. Meu probe `openclaude mcp list` não passava `cwd` — usava
o cwd herdado do processo do VSCode, que normalmente é `C:\` ou alguma pasta
diferente do workspace ativo. Resultado: o probe via uma lista de scope
diferente do registro que o usuário criou.

### `extension.js` — alteração

`checkRufloEnvironment`, probe 2 (MCP list): agora passa `cwd: getWorkspaceCwd()`
+ `env: probeEnv` (mesmo PATH expandido dos outros probes). Timeout subido de
5s → 8s porque o openclaude inicializa banner antes de imprimir a lista (o
`mcp list` no openclaude compartilha o boot do chat).

### Como verificar

1. Abra o workspace correto no VSCode (o mesmo onde você rodou
   `openclaude mcp add` — no seu caso `D:\TCC_oficial\TCC-MOTIVA-APP`).
2. Reload Window.
3. Pill deve agora mudar pra **"Ruflo: MCP ativo"** (dot azul).
4. Click no pill força re-check se precisar.

### Importante saber

O openclaude grava MCP servers em **`.claude.json` per-projeto** — então:
- Se trocar de workspace pra um projeto sem o registro, o pill volta pra
  amarelo ("instalado mas MCP não-registrado nesse projeto").
- Pra registrar globalmente (todos os projetos), use a flag adequada do
  openclaude (consulte `openclaude mcp add --help` — possivelmente
  `--scope user` ou similar).

### Comandos úteis pra próxima fase

Pra ativar o daemon (background workers que rodam sozinhos):
```cmd
claude-flow daemon start
```

Após isso o pill deve subir pra verde ("daemon ON") após o próximo re-check.

---

## Rodada 10 — Reorganização da chat-controls bar (Opção A)

Usuário identificou que a barra de controles do chat tinha **duplicação
conceitual**:
- "Default" aparecia em Modo (chat normal) E em Permission (pergunta tudo)
- "Plan" aparecia em Modo (LLM só planeja) E em Permission (LLM só propõe)

E mais grave: o `setSessionMode` ainda implementava pareamento implícito
(`mode='plan'` → forçava `permissionMode='plan'`), fazendo o estado mudar
sob os pés do usuário em situações onde ele só queria mexer em um eixo.

### Decisão de UX (Opção A)

Colapsar Modo para **2 valores binários** ortogonais à Permission:

| Antes (3 modos) | Depois (2 modos) | Tradução |
|---|---|---|
| `mode = default` | `mode = single` | LLM único responde |
| `mode = plan` | (removido — vira `permissionMode = plan`) | Idem antes, sem duplicar |
| `mode = ruflo` | `mode = swarm` | LLM usa MCP do Ruflo pra orquestrar agentes |

Permission continua exatamente igual (4 valores: default / accept / plan /
bypass). Combinações fazem sentido em qualquer cruzamento — ex.:
`single + plan`, `swarm + plan`, `swarm + bypass`, etc.

### `extension.js` — alterações

| Trecho | Antes | Depois |
|---|---|---|
| Constantes | `SESSION_MODES = ['default', 'plan', 'ruflo']` | `SESSION_MODES = ['single', 'swarm']` |
| Default | `DEFAULT_SESSION_MODE = 'default'` | `DEFAULT_SESSION_MODE = 'single'` |
| Helper novo | — | `normalizeSessionMode(mode)` — converte legacy values (`default`/`plan`→`single`, `ruflo`→`swarm`) |
| `setSessionMode` | Tinha pareamento implícito com `permissionMode` | Totalmente ortogonal — não toca em `permissionMode`. Aceita legacy via normalize |
| `sendUserMessage` (prefix) | `session.mode === 'ruflo'` | `normalizeSessionMode(session.mode) === 'swarm'` |
| `serializeSession` | `session.mode \|\| DEFAULT_SESSION_MODE` | `normalizeSessionMode(session.mode)` — garante que webview sempre recebe valor canônico |
| HTML chip group | 3 botões: Default / Plan / Ruflo | 2 botões: Single / Swarm |
| HTML aria-label | "Modo de operação" | "Quem responde" (mais descritivo) |
| `RUFLO_PROMPT_PREFIX` | "Modo Ruflo Swarm ativo..." | "Modo Swarm ativo..." |

### `media/webview.js` — alteração

`renderActiveSession` agora normaliza `session.mode` antes de aplicar a
classe `.active`:
```js
let opMode = session.mode;
if (opMode === 'ruflo') opMode = 'swarm';
else if (opMode !== 'swarm') opMode = 'single';
```

Sessões antigas com `mode: 'ruflo'`/`'default'`/`'plan'` ainda renderizam
corretamente — viram `swarm`/`single`/`single` respectivamente.

### `media/webview.css` — sem alteração

A classe `.mode-btn-ruflo` foi mantida (era o nome interno) — agora ela
fica no botão "Swarm" no HTML. Visualmente continua com a paleta sunset
quando ativo. Renomeação cosmética da classe ficou pendente; não há urgência.

### Como verificar

1. Reload Window.
2. Abre um chat. Acima da barra de Permission, agora aparecem só 2 chips:
   **Single** e **Swarm**.
3. Clica "Swarm" → ele pega a cor sunset.
4. Clica em qualquer Permission (Default/Accept/Plan/Bypass) → não mexe
   no chip Single/Swarm (era o bug do pareamento implícito).
5. Combinações úteis pra testar:
   - **Single + Plan** = LLM só planeja, não executa
   - **Swarm + Accept** = swarm pode editar arquivos
   - **Swarm + Bypass** = swarm faz tudo sem perguntar (perigoso)

### Limpeza / dívida técnica

- Classe CSS `.mode-btn-ruflo` poderia virar `.mode-btn-swarm` pra
  consistência. Adiar até a próxima refatoração de CSS.
- Logs de console agora emitem `[Mode] single` / `[Mode] swarm`.

---

## Rodada 11 — Controles confiáveis + Bypass funcional

Validação feita contra o `openclaude` real em modo `stream-json` mostrou:
- `default`, `acceptEdits`, `plan` e `set_max_thinking_tokens` funcionavam de verdade
- `bypassPermissions` era rejeitado em runtime porque a sessão não nascia com
  `--allow-dangerously-skip-permissions`
- a UI mudava otimisticamente antes de saber se o runtime tinha aceitado, então
  podia mentir para o usuário

### `extension.js`

- sessões agora mantêm `pendingControlRequests`
- `sendControlRequest` aceita metadados do ajuste solicitado
- `setSessionPermissionMode` e `setSessionThinking` só alteram o estado local
  depois de `control_response` bem-sucedido
- `handleControlResponse` aplica sucesso, reverte rejeições e mostra erro nativo
  do VS Code quando o OpenClaude nega uma troca
- o spawn do OpenClaude agora inclui `--allow-dangerously-skip-permissions`,
  que deixa `bypassPermissions` disponível para ativação posterior sem ligá-lo
  por padrão

### `media/webview.js`

- removidos os updates otimistas de Permission e Thinking
- os controles agora só mudam visualmente após `sessionUpdated` confirmado pelo host
- comentários antigos sobre pareamento implícito entre Modo e Permission foram
  corrigidos

### `media/webview.css`

- comentário da barra de modo atualizado para `single · swarm`

### Como verificar

1. Reload Window.
2. Abra um chat e clique `Default`, `Accept`, `Plan`, `Bypass`:
   cada chip só deve mudar depois da confirmação real do host.
3. O botão `Bypass` agora deve funcionar em uma sessão normal iniciada pela extensão.
4. Clique `Thinking`: o estado visual deve mudar após a confirmação do host,
   e não antes.

---

## Rodada 12 — Refatoração estrutural do backend

Objetivo desta rodada: deixar a manutenção mais simples antes de avançar no
Ruflo interno, sem mudar o comportamento da extensão.

### Nova estrutura

- `src/constants.js`
  - constantes globais de sessão, permissões, Ruflo e profiles
- `src/utils.js`
  - helpers compartilhados de sessão, parsing, histórico e renderização
- `src/stores/profile-store.js`
  - persistência e segredos dos profiles
- `src/stores/skills-and-agents-store.js`
  - leitura/criação/importação de skills e agents
- `src/stores/history-store.js`
  - histórico OpenClaude + leitura de sessões Codex
- `src/commands.js`
  - fluxos de Quick Pick/Input Box para profiles, skills e agents
- `src/webview-html.js`
  - HTML server-side da webview
- `src/openclaude-view-provider.js`
  - classe principal de sessão/chat

### `extension.js`

- caiu de ~3860 linhas para ~40 linhas
- agora funciona só como entry point:
  - cria stores
  - instancia `OpenClaudeViewProvider`
  - registra comandos

### `src/openclaude-view-provider.js`

- concentra a classe principal de sessão/chat (~1800 linhas)
- mantém toda a orquestração existente em um lugar próprio, separado do entry
  point e dos serviços auxiliares

### Validação

- `node --check extension.js`
- `node --check src/constants.js`
- `node --check src/utils.js`
- `node --check src/commands.js`
- `node --check src/webview-html.js`
- `node --check src/openclaude-view-provider.js`
- `node --check src/stores/profile-store.js`
- `node --check src/stores/skills-and-agents-store.js`
- `node --check src/stores/history-store.js`

Todos passaram.

---

## Rodada 13 — Hotfix pós-refatoração + smoke test

Após a Rodada 12, a extensão carregava, mas vários fluxos quebravam em runtime.
Os logs do Extension Host mostraram:
- `getWorkspaceCwd is not defined`
- `profileNeedsApiKey is not defined`

Esses helpers ainda eram usados por `OpenClaudeViewProvider`, mas ficaram fora
do import quando a classe foi movida para `src/openclaude-view-provider.js`.

### Correções

- `src/openclaude-view-provider.js`
  - voltou a importar `getWorkspaceCwd`, `profileNeedsApiKey`,
    `isLocalBaseUrl`, `readJsonLine` e `extractTextFromContent`
  - passou a importar também `configureProfileApiKey`
- `src/commands.js`
  - agora exporta `configureProfileApiKey`

### Teste novo

- adicionado `scripts/smoke-backend.js`
- adicionado `npm run smoke`
- o smoke cobre:
  - `hydrate` com histórico
  - seleção de profile
  - criação de novo chat
  - abertura do Ruflo CLI
  - fluxo de Modelos
  - fluxo de Skills
  - `buildEnv` local
  - parsing de stdout e de `tool_result`

### Validação feita

- `npm run smoke`
- `node --check` em backend, módulos extraídos e webview
- conferência dos logs reais do Extension Host para confirmar a causa original

---

## Rodada 14 — Revisão do fluxo macro do Ruflo

Após esclarecer a diferença entre `Ruflo CLI`, `Swarm` e o pill de status, o
plano futuro foi reorganizado.

### Decisão

Antes de aprofundar o Ruflo interno, a extensão vai ganhar uma camada de
administração visual do `claude-flow`.

### Nova ordem das próximas fases

1. **Fase 2A — Administração Ruflo + pill confiável**
   - corrigir diagnóstico da pill
   - menu dropdown com ações de MCP/daemon/doctor/CLI
2. **Fase 2B — Página de configuração Ruflo**
   - tela visual para setup e manutenção sem terminal
3. **Fase 3 — Catálogo real de agentes + regras de composição**
   - entender agentes instalados e como formar times
4. **Fase 4 — Execução previsível do Swarm interno**
   - deixar de depender só do prefixo textual
5. **Fase 5 — Live view do swarm**
   - lanes visuais por agente e acompanhamento da execução

### Motivo da mudança

- a administração visual é um complemento do plano, não um desvio
- fica mais coerente resolver primeiro "o Ruflo está pronto e configurado?"
  antes de pedir que o Swarm use essa infraestrutura
- o botão `Ruflo CLI` passa a ser entendido como via avançada/manual, não como
  a principal forma de operar o Ruflo

---

## Rodada 15 — Botão "Modelos" colapsado dentro do dropdown de perfis

### Motivação

A toolbar tinha um dropdown `#profileCombobox` (escolher perfil ativo) e,
**logo ao lado**, um botão separado `#manageProfiles` rotulado "Modelos"
(que abria o Quick Pick de cadastro/edição). Eram duas affordances pra
"mexer em modelos" ocupando espaço lado a lado. Em sidebars finas isso
empurrava os outros botões (Skills / Ruflo CLI / pill) pra fora ou pra
linha de baixo.

Usuário pediu: colapsar o botão dentro do próprio dropdown como último
item, mantendo o fluxo VS Code Quick Pick original quando clicado.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/webview-html.js` | Removida a `<button id="manageProfiles">` da toolbar (linha 46). |
| `media/webview.js` | Removido ref `manageBtn`; removido listener standalone do botão; `openCombobox` agora abre mesmo com 0 perfis; `renderComboboxMenu` agora monta divider + item especial "+ Editar / cadastrar modelos" (ou "+ Cadastrar primeiro modelo" quando lista vazia) no final, que dispara `manageProfiles` ao host. |
| `media/webview.css` | Estilos novos: `.combobox-divider` (linha sutil entre lista e ação), `.combobox-option-action` (cor accent + hover suave), `.combobox-empty` (texto descritivo quando lista zerada). |

### Comportamento esperado

- **Com perfis**: dropdown mostra perfis normalmente, depois uma linha
  divisória, depois "+ Editar / cadastrar modelos" em cor de destaque.
- **Sem perfis**: dropdown abre mostrando "Nenhum modelo cadastrado ainda."
  + "+ Cadastrar primeiro modelo" — antes o dropdown nem abria nesse caso
  (early return), agora é o jeito de entrar no fluxo de cadastro.
- O Quick Pick nativo do VS Code (mesmo de antes) continua sendo o destino
  do clique no item de gerenciar — nenhuma mudança no fluxo `manageProfiles`
  do host.

### Como verificar

1. Reload Window.
2. Toolbar deve mostrar: dropdown de perfis · alerta de API key (se sem
   key) · Skills · Ruflo CLI · pill do Ruflo. **Sem o botão "Modelos"
   separado.**
3. Click no dropdown: lista de perfis aparece com divisor e ação
   "+ Editar / cadastrar modelos" no final.
4. Click na ação: abre o Quick Pick nativo (mesmo de antes).
5. Cenário "sidebar zerada": delete todos os perfis (ou rode em
   workspace que nunca teve), o dropdown ainda abre e oferece
   "+ Cadastrar primeiro modelo".

### Pós-correções aplicadas na mesma rodada

Após a primeira tentativa o usuário reportou que **tudo parou de funcionar**
no webview (perfil não carregava, histórico sumia, botões não respondiam).

**Bug 1 — ref órfã.** Ao remover `manageBtn: document.getElementById('manageProfiles')`
do `refs`, esqueci que a linha **115** do `media/webview.js` ainda fazia
`refs.manageBtn.innerHTML = ICONS.settings + '<span>Modelos</span>'`. Como
`refs.manageBtn` virou `undefined`, o webview lançava
`TypeError: Cannot read properties of undefined (reading 'innerHTML')` na
inicialização — o que mata o script inteiro e nada do webview executa.
Fix: removida a linha de injeção do ícone (o botão não existe mais).
**Lição**: sempre `grep` por `refs.<nome>` antes de remover uma chave do
objeto `refs`.

**Bug 2 — botão "+ Editar / cadastrar modelos" sem texto visível.**
Em alguns temas o `var(--accent)` (que aponta pra `--vscode-focusBorder`)
acaba colapsando contra `var(--hover)`, deixando o texto invisível. Fix
no `media/webview.css`:
- `color: var(--vscode-textLink-foreground, var(--accent, #3794ff))` —
  cor de link do tema, com contraste WCAG garantido em qualquer tema
- `!important` no `.combobox-option-name` interno pra vencer a regra
  herdada de `.combobox-option .combobox-option-name { color: var(--text) }`
- `overflow: visible; text-overflow: clip` no nome do action item (evita
  ellipsis indevido se o grid layout do parent calculasse mal a largura)
- Hover usa `--vscode-list-activeSelectionBackground` +
  `--vscode-textLink-activeForeground` (também WCAG-safe)
- Aumentado `font-weight: 500 → 600` pra dar mais peso visual

**Limpeza — arquivo `{,`.** Detectado um arquivo de 0 bytes chamado
literalmente `{,` na raiz da extensão, criado em 14/maio por algum
redirect de shell mal escrito (typo do tipo `cp foo {,bak}`). Sem
relação com o projeto, removido.

---

## Rodada 16 — Reordenação do Quick Pick "Gerenciar modelos"

### Motivação

Usuário observou que, ao abrir o Quick Pick nativo do VSCode (acessível
pelo "+ Editar / cadastrar modelos" do dropdown na Rodada 15), a primeira
opção era **"Selecionar modelo ativo"** — útil só quando você já tem
perfis cadastrados. Em onboarding (sem nenhum perfil) ou quando o usuário
abre o Quick Pick especificamente pra **adicionar** um modelo novo, faz
mais sentido que essa seja a primeira opção visível.

### Arquivo alterado

`src/commands.js`, função `manageProfiles`, linhas 43-48.

**Antes:**
1. Selecionar modelo ativo
2. **Cadastrar modelo novo**
3. Editar modelo ativo
4. Cadastrar/Alterar API key
5. Excluir modelo ativo

**Depois:**
1. **Cadastrar modelo novo** ← agora 1º
2. Selecionar modelo ativo
3. Editar modelo ativo
4. Cadastrar/Alterar API key
5. Excluir modelo ativo

### Como verificar

1. Reload Window.
2. Click no "+ Editar / cadastrar modelos" do dropdown de perfis (ou
   `Ctrl+Shift+P` → "Gerenciar modelos OpenClaude").
3. O Quick Pick deve abrir com **"Cadastrar modelo novo"** na primeira
   linha.

---

## Rodada 17 — Fase 2A + 2B concluídas de verdade

Após revisar o pedido do usuário, ficou claro que a primeira tentativa de
Fase 2A/2B tinha ficado incompleta: havia começado uma base de backend para
o Ruflo, mas quase nada novo aparecia na interface. Esta rodada fecha as duas
fases com superfície visível, ações funcionais e testes próprios.

### Fase 2A — Administração Ruflo + pill confiável

**Backend novo:**
- criado `src/services/ruflo-service.js`
- o detector passou a ler o MCP por workspace diretamente em `.claude.json`
  e a separar melhor os motivos de estado:
  - `cliMissing`
  - `configError`
  - `mcpMissing`
  - `daemonStopped`
  - `ready`
- o status também passou a expor `daemonPid` e `daemonWorkersEnabled`
- `OpenClaudeViewProvider` agora delega ao serviço e recebeu
  `runRufloAction(action)` para:
  - registrar/remover MCP do projeto
  - iniciar/parar daemon
  - rodar `doctor`
  - inicializar memória

**UI visível:**
- o pill `Ruflo: ...` agora abre um dropdown real com:
  - abrir configurações
  - reverificar status
  - registrar/remover MCP
  - iniciar/parar daemon
  - inicializar memória
  - rodar diagnóstico
  - abrir CLI
- a label do pill agora distingue melhor os estados:
  - `Ruflo: offline`
  - `Ruflo: instalado`
  - `Ruflo: MCP pronto`
  - `Ruflo: daemon ON`
  - `Ruflo: revisar`

### Fase 2B — Página de configuração Ruflo

**Nova tela dentro da própria extensão:**
- `src/webview-html.js` ganhou a view `#rufloSettings`
- a tela agora possui seções reais para:
  - Estado geral
  - Projeto atual
  - Daemon
  - Memória
  - Ferramentas
  - Detalhes
- a página mostra:
  - versão instalada
  - se o MCP está ligado ao projeto atual
  - se o daemon está ativo
  - workspace atual
  - PID e quantidade de workers ativos quando disponíveis
- botões são desabilitados quando a CLI ainda não existe, para a UI não
  prometer ações impossíveis.

### Testes e validação adicionados

- `scripts/smoke-backend.js` agora cobre:
  - `getRufloStatus`
  - `runRufloAction('registerMcp')`
- novo `scripts/smoke-ruflo-service.js` cobre:
  - leitura de status
  - transição `mcpMissing -> daemonStopped -> ready`
  - registro/remoção de MCP
  - start de daemon
  - `doctor`
  - `memory init`
- `npm run smoke` passou a rodar os dois testes
- validação visual feita em harness local do webview:
  - pill abriu menu
  - `Abrir configurações` abriu a tela nova
  - resumo, workspace e bloco de daemon renderizaram corretamente
  - botões MCP/daemon estavam habilitados no estado válido

### Arquivos alterados nesta rodada

| Arquivo | Mudança |
|---|---|
| `src/services/ruflo-service.js` | Serviço novo e detector confiável do Ruflo |
| `src/openclaude-view-provider.js` | Integração do serviço + handlers de ação |
| `src/webview-html.js` | Dropdown do pill + página `#rufloSettings` |
| `media/webview.js` | Estado, handlers e render da administração Ruflo |
| `media/webview.css` | Estilos do menu e da página Ruflo |
| `scripts/smoke-backend.js` | Cobertura das mensagens Ruflo |
| `scripts/smoke-ruflo-service.js` | Smoke isolado do serviço Ruflo |
| `package.json` | `npm run smoke` ampliado |

---

## Rodada 18 — Remoção do botão duplicado `Ruflo CLI`

Depois que a Fase 2A/2B ganhou:
- menu no pill `Ruflo`
- ação `Abrir CLI` dentro desse menu
- botão `Abrir CLI` dentro da página de configuração

o botão separado `Ruflo CLI` no topo ficou redundante.

### Mudanças

- `src/webview-html.js`
  - removido `<button id="openRufloCli">Ruflo CLI</button>` da toolbar
- `media/webview.js`
  - removido o ref `openRufloCliBtn`
  - removido o listener exclusivo daquele botão

### O que permanece

- o comando de host `openRufloCli` continua existindo
- o Command Palette ainda pode abrir o CLI
- o menu do pill e a tela de configuração continuam oferecendo `Abrir CLI`

---

## Rodada 19 — Nova exigência arquitetural: sair de `.claude`

Usuário percebeu corretamente que, embora a extensão não dependa do executável
oficial Claude Code para funcionar, ela ainda usa vários caminhos herdados:
- `~/.claude/skills`
- `~/.claude/agents`
- `~/.claude/projects`
- `~/.claude/deleted-history`
- `~/.claude.json`

Isso foi separado conceitualmente em duas coisas diferentes:
1. **independência de runtime** — já existe: a extensão usa `openclaude`, não
   precisa do Claude Code oficial rodando;
2. **independência estrutural de dados** — ainda não existe por completo.

### Auditoria local feita

No `@gitlawb/openclaude` 0.8.0 instalado:
- já existe suporte a `~/.openclaude`
- já existe suporte a `~/.openclaude.json`
- `.openclaude/settings.json` já aparece como caminho de projeto
- mas algumas superfícies ainda carregam caminhos `.claude` no CLI atual,
  especialmente `skills`/`agents` de projeto

### Decisão

Antes da Fase 3 do Ruflo interno, entrou uma nova fase obrigatória:

**Fase 2C — Autonomia `.openclaude`**

Objetivo:
- tornar `.openclaude`/`.openclaude.json` o padrão do produto
- manter `.claude` apenas como compatibilidade temporária de migração
- resolver explicitamente a lacuna dos caminhos de projeto ainda legados no
  CLI atual

---

## Rodada 20 — Ativação única do Ruflo + memória inteligente

Depois de testar MCP, daemon e memória separadamente, o fluxo ficou mais claro:
- **MCP** é a ligação do chat com o Ruflo
- **memória** é a base persistente do projeto
- **daemon** são os workers de fundo

Para o uso normal, faz mais sentido ter um botão principal que prepare o
conjunto completo e deixar os controles finos dentro da configuração.

### Mudanças

- `src/services/ruflo-service.js`
  - status agora inclui `memoryInitialized` e `memoryPath`
  - novo estado `memoryMissing`
  - novo método `activateWorkspace()`:
    1. registra MCP se faltar
    2. inicializa memória se faltar
    3. inicia daemon se faltar
  - `initializeMemory()` virou idempotente: se o banco já existe, retorna
    sucesso sem rodar o comando de novo
- `src/openclaude-view-provider.js`
  - nova ação `activateAll`
- `media/webview.js`
  - menu do pill agora mostra um único `Ativar Ruflo` quando algo está pendente
  - menu deixa os controles individuais para a tela de configuração
  - pill passou a distinguir `Ruflo: memória` e `Ruflo: ativo`
  - detalhes agora mostram o caminho da memória
- `src/webview-html.js`
  - nova linha de status `Memória`
  - seção de memória com status real

### Comportamento esperado

- Se algo faltar, o menu do pill mostra `Ativar Ruflo`
- Ao clicar, a extensão prepara MCP + memória + daemon automaticamente
- Na configuração, MCP e daemon continuam com controles individuais
- Memória:
  - mostra `Inicializar` quando ainda não existe
  - mostra `Inicializada` desabilitado quando já existe

### Validação

- `npm run smoke`
- smoke do serviço cobre:
  - `mcpMissing -> memoryMissing -> daemonStopped -> ready`
  - ativação completa
  - inicialização idempotente da memória
- harness visual confirmou:
  - `Ativar Ruflo` aparece apenas quando necessário
  - memória já pronta mostra `Inicializada`

---

## Rodada 21 — Feedback de carregamento do Ruflo

O daemon pode levar alguns segundos para subir, então o fluxo do Ruflo agora
mostra claramente que ainda está trabalhando até o status final chegar.

### Mudanças

- `media/webview.js`
  - pill passa para estado `busy` durante ações do Ruflo
  - ativação global mantém `Ruflo: ativando...` até o status final
  - ações de desligamento mostram `Ruflo: desativando...`
  - botões da configuração ficam desabilitados e trocam para textos como
    `Registrando...`, `Iniciando...`, `Parando...` e `Inicializando...`
  - a resposta intermediária da ação não encerra mais o carregamento cedo
- `media/webview.css`
  - novo spinner circular no pill
  - spinner também nos botões em carregamento do menu e das configurações

### Validação

- `node --check media/webview.js`
- `node --check src/webview-html.js`
- `npm run smoke`
- harness visual confirmou:
  - após `Ativar Ruflo`, o pill continua em `busy` depois de
    `rufloActionResult`
  - o estado só vira `Ruflo: ativo` quando chega o `rufloStatus` final
  - ao iniciar daemon nas configurações, o botão mostra `Iniciando...`,
    fica desabilitado e só volta ao normal no status final
  - ao parar daemon, o pill mostra `Ruflo: desativando...` até o status final

---

## Rodada 22 — Ativação no topo + remoção de memória

Fechamos dois ajustes de uso antes de seguir para as próximas fases do Ruflo.

### Mudanças

- `media/webview.js`
  - `Ativar Ruflo` agora é a primeira opção do menu sempre que aparece
  - nova ação visual `deleteMemory`
  - a tela de configuração mostra `Apagar memória` quando existe memória no
    projeto
  - durante a remoção, o pill mostra `Ruflo: limpando...`
- `src/webview-html.js`
  - a seção de memória passou a ter dois botões:
    `Inicializar` e `Apagar memória`
- `media/webview.css`
  - novo agrupador de ações da seção de memória
- `src/services/ruflo-service.js`
  - novo método `deleteMemory()`
  - a remoção apaga `memory.db` e também os arquivos auxiliares SQLite
    `memory.db-wal` e `memory.db-shm`, quando existirem
- `src/openclaude-view-provider.js`
  - nova ação `deleteMemory`
- smoke tests
  - cobertura do backend para a nova ação
  - cobertura do serviço para remoção real da memória e retorno ao estado
    `memoryMissing`

### Validação

- `node --check media/webview.js`
- `node --check src/webview-html.js`
- `node --check src/services/ruflo-service.js`
- `node --check src/openclaude-view-provider.js`
- `npm run smoke`
- harness visual confirmou:
  - `Ativar Ruflo` aparece como primeira opção do menu
  - memória inicializada mostra `Inicializada` + `Apagar memória`
  - ao apagar, o botão passa para `Apagando...` e o pill para
    `Ruflo: limpando...`
  - no status final, a memória volta para `não inicializada` e
    `Inicializar` fica disponível de novo

---

## Rodada 23 — Fase 2C concluída: autonomia `.openclaude`

A extensão deixou de tratar `.claude` como casa principal. O novo desenho
mantém compatibilidade com o `openclaude` 0.8.0 atual, mas centraliza tudo o
que é próprio do produto em `.openclaude`.

### Mudanças

- novo `src/services/openclaude-paths.js`
  - fonte única de caminhos
  - criação automática de `~/.openclaude`
  - migração automática de:
    - `~/.claude/skills`
    - `~/.claude/agents`
    - `~/.claude/projects`
    - `~/.claude/deleted-history`
    - `~/.claude.json`
  - merge seguro de `.claude.json` para `.openclaude.json` sem sobrescrever o
    que já existir no arquivo novo
  - migração de projeto para `.openclaude`
  - ponte temporária de projeto para o CLI atual enxergar
    `.claude/{commands,agents,output-styles,skills,workflows}`
- `extension.js`
  - cria uma única instância compartilhada de `OpenClaudePaths`
- `src/stores/skills-and-agents-store.js`
  - user/project skills e agents agora nascem em `.openclaude`
  - escrita de projeto sincroniza automaticamente a ponte legacy
- `src/stores/history-store.js`
  - histórico prefere `.openclaude/projects`
  - dedupe evita duplicar sessões copiadas durante migração
  - exclusão vai para `.openclaude/deleted-history`
  - apagar uma sessão remove também as cópias legacy equivalentes, para ela
    não reaparecer depois da migração
- `src/services/ruflo-service.js`
  - MCP do Ruflo agora lê/escreve `.openclaude.json`
- `src/openclaude-view-provider.js`
  - antes de abrir sessão, garante estado de projeto e sincroniza a ponte
    legacy necessária para o CLI atual
  - mensagens de exclusão de histórico mostram o novo caminho
- `src/commands.js`
  - textos e atalhos de pasta foram atualizados para `.openclaude`
- novo `scripts/smoke-openclaude-paths.js`
  - valida migração, merge, dedupe de histórico, criação em `.openclaude`,
    ponte de projeto e config do Ruflo

### Decisão de compatibilidade

O `openclaude` 0.8.0 local já usa:
- `~/.openclaude`
- `~/.openclaude.json`
- `.openclaude/settings.json`

Mas o carregador de markdown de projeto ainda procura alguns diretórios em
`.claude`. Para não bloquear o projeto inteiro nesse ponto upstream, a
extensão agora mantém `.openclaude` como fonte canônica e gera uma ponte
automática temporária para os diretórios de projeto que o CLI ainda espera.

### Validação

- `node --check` nos módulos alterados
- `npm run smoke`
- `smoke-openclaude-paths` confirmou:
  - migração de user-level para `.openclaude`
  - merge de config preservando dados novos e antigos
  - migração de projeto para `.openclaude`
  - criação de novos skills/agentes em `.openclaude`
  - espelho legacy automático para o CLI atual
  - histórico sem duplicação após migração
  - exclusão de histórico em `.openclaude/deleted-history`
  - exclusão removendo todas as cópias da mesma sessão
  - `RufloService` escrevendo em `.openclaude.json`

---

## Rodada 24 — Skills opt-in por sessão (biblioteca + picker)

### Motivação

O OpenClaude (e o `openclaude.cmd` por baixo) auto-carrega TODAS as skills
que estiverem em `~/.openclaude/skills/` em qualquer chat. Com ~135 skills
do `google/skills` + `pm-claude-skills` instaladas:

- ~7000 tokens consumidos só pra "indexar" as descriptions toda sessão
- Risco real de ativação errada (skill genérica disparando em contexto que
  não era pra ela)
- Mistura de conteúdos quando 2 skills com domínios sobrepostos ativam
  juntas

Usuário pediu **controle explícito por sessão**: ver o catálogo, adicionar
skills via "+", remover via "×", e o chat lembrar quais estão ativas.

### Decisão de arquitetura (Opção A)

Dois diretórios separados:

| Diretório | Quem lê |
|---|---|
| `~/.openclaude/skills/` | **O CLI `openclaude.cmd`** — fica VAZIA, então nada auto-ativa |
| `~/.openclaude/skills.library/` | **A extensão** — biblioteca completa, listada na UI |

A injeção do conteúdo da skill acontece em `sendUserMessage`, ANTES do
payload virar `stdin` do CLI. O usuário vê só seu texto no transcript; o
LLM vê: `[Skills ativas...]\n\n<body>\n\n---\n\n<seu texto>`.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `~/.openclaude/skills/` → `~/.openclaude/skills.library/` (filesystem) | Pasta renomeada; nova `skills/` vazia criada pra CLI bootar limpo |
| `src/stores/skills-and-agents-store.js` | Novos métodos `listLibrarySkills()` e `loadSkillContent(skillId)`. Path-traversal guard no skillId (regex `^[a-zA-Z0-9_-]+$`). |
| `src/openclaude-view-provider.js` | `session.activeSkills: []` em createSession + viewer + serializeSession. Métodos `addSkillToSession`/`removeSkillFromSession`. Handlers de mensagem `addSkill`/`removeSkill`/`getAvailableSkills`. `sendUserMessage` agora compõe `wrappers[]` (skills + swarm) antes do conteúdo do user. |
| `src/webview-html.js` | Novo `#activeSkillsBar` acima de `#messages`. Novo `#skillsToggle` no chat-controls-right (entre commandsButton e thinkingToggle). Novo `#skillsMenu` flutuante (`position: absolute; bottom: 100%`) com header (busca) + lista. |
| `media/webview.js` | State: `availableSkills`, `availableSkillsLoaded`, `skillsMenuOpen`, `skillsMenuFilter`. Refs novos. Funções: `renderActiveSkills`, `openSkillsMenu`, `closeSkillsMenu`, `renderSkillsMenu`. Update otimista no add/remove. Handler de mensagem `availableSkills`. Filtragem em tempo real (busca em id+name+description). |
| `media/webview.css` | Estilos novos: `.active-skills-bar`, `.active-skill-chip`, `.active-skill-remove`, `.skills-toggle`, `.skills-toggle-badge`, `.skills-menu` (+header/search/list/item/-name/-desc/-add). |

### UX

**Para ativar uma skill:**
1. Clicar **+ Skills** no chat-controls (mostra badge com contador)
2. Menu abre acima do composer; busca em tempo real
3. Click em `+` ao lado de uma skill → vira `✓` (verde) imediatamente
4. Chip aparece no topo do chat
5. Próxima mensagem que você enviar carrega a skill no prompt invisível

**Para remover:**
- Click no `×` do chip; ou abre o menu novamente e o `✓` volta a `+`

**Persistência:**
- `session.activeSkills = ['code-review-checklist', 'prd-template']` é
  serializado junto com a sessão. Retomar uma sessão do histórico restaura
  os chips.
- Cada chat tem seu próprio conjunto — sessão A pode ter `prd-template`,
  sessão B pode ter `debugging-log-analyser`, sem interferência.

### Detalhes técnicos importantes

- **Path traversal guard**: `loadSkillContent` rejeita ids que não casem
  com `^[a-zA-Z0-9_-]+$`. Skill maliciosa não consegue escapar pra
  `../../../something`.
- **Cache cliente-side**: a biblioteca é fetchada uma vez (`getAvailableSkills`
  só dispara no primeiro `openSkillsMenu`). Reload Window reseta.
- **Update otimista**: o webview já mostra o chip / vira o ✓ antes de a
  resposta do host chegar — o `sessionUpdated` confirma ou corrige.
- **Compatibilidade Swarm**: skills + modo Swarm coexistem.
  `sendUserMessage` empilha `wrappers[]` na ordem `[skills, swarm]`. Cada
  turno re-injeta as skills (overhead aceito; mitigação via prompt
  caching fica como follow-up).
- **Sem auto-ativação acidental**: como `~/.openclaude/skills/` fica vazia,
  o `openclaude.cmd` nunca vê skill ativa por padrão. Tudo passa pelo
  picker.

### Como verificar

1. **Reload Window**.
2. Abre um chat. Acima da barra `Single/Swarm` aparece a barra de skills
   ativas — vazia inicialmente.
3. Botão **+ Skills** no chat-controls. Click → menu abre acima do
   composer.
4. Digita "code review" na busca — só `code-review-checklist` filtra.
5. Click no `+` → chip "code-review-checklist" aparece no topo, ícone
   vira `✓` no menu, badge no botão mostra **1**.
6. Manda uma mensagem do tipo "Revisa esse PR rapidão". Olha o DevTools
   console: `[Skill] add code-review-checklist session ...` deve ter
   aparecido. A resposta do LLM deve usar a estrutura/checklist da skill.
7. Click no `×` do chip → some imediatamente, badge volta a 0.
8. Cria um novo chat — barra de skills ativas começa vazia outra vez.

### Limitações conhecidas (Rodada 24)

- O conteúdo das skills é re-enviado **a cada turno**. Em sessões longas,
  isso multiplica tokens. Mitigação futura: usar prompt caching dos
  providers que suportam (Anthropic tem cache_control; OpenAI tem prompt
  caching automático). Não implementado nesta rodada.
- Sem categorização visual no menu. 135 skills numa lista flat é
  navegável com a busca, mas categorias (Engineering / PM / Design / etc.)
  ajudariam. Follow-up de UX, não bloqueia o uso.

---

## Rodada 25 — Skills picker mais limpo (sem barra, toggle real, ativas no topo)

Polimento direto em cima da Rodada 24. Usuário pediu três coisas pequenas:
remover a barra de chips ativas no topo do chat (visual desnecessário, já
que o badge no botão "+ Skills" mostra o contador), tornar o item do menu
um toggle de verdade (click no ✓ remove em vez de o botão ficar
disabled), e ordenar a lista com as ativas primeiro quando o menu abre.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/webview-html.js` | Removida a `<div id="activeSkillsBar">` que ficava acima de `#messages`. Não há mais chip bar no topo do chat — a única superfície de skills agora é o próprio picker. |
| `media/webview.js` | Removida a função `renderActiveSkills` e a ref `activeSkillsBar`. Em troca, criada `updateSkillsBadge(session)` que só sincroniza o contador do botão `+ Skills` (a única peça que sobreviveu da Rodada 24 fora do menu). Trocadas todas as chamadas a `renderActiveSkills` por `updateSkillsBadge`. |
| `media/webview.js` | `renderSkillsMenu` agora **ordena ativas no topo** antes de iterar — usa `activeSkillsOf(session)` como ordem canônica das ativas (na ordem em que foram ativadas) e mantém a ordem natural da biblioteca pras inativas. Snapshot é fixado no momento da abertura: marcar/desmarcar enquanto o menu está aberto **não re-ordena** (evita que o item pule de baixo do cursor). |
| `media/webview.js` | O `<button>` de ação dentro de cada item virou **toggle bidirecional**. Quando ativo: textContent `✓`, classe `.active`, listener chama `removeSkill`. Quando inativo: textContent `+`, listener chama `addSkill`. Não há mais `disabled = true` — o botão é sempre clicável, só muda o efeito. Update otimista local (`sess.activeSkills` atualizado + `renderSkillsMenu()` re-render) faz o estado virar instantâneo antes do round-trip pro host. |
| `media/webview.css` | Removidos os estilos `.active-skills-bar`, `.active-skill-chip`, `.active-skill-label`, `.active-skill-remove` (substituídos por um comentário explicando o porquê pra quem ler depois). |
| `media/webview.css` | Nova regra `.skills-menu-item.is-active`: fundo `color-mix(--ok 8%)` + `box-shadow: inset 2px 0 0 var(--ok)` (stripe vertical verde à esquerda). Hover sobe pra 14%. Faz a linha da skill ativa "saltar" visualmente na lista. |
| `media/webview.css` | `.skills-menu-item-add.active` agora pinta o botão `✓` com fundo verde sutil + borda verde. No hover, troca pra cor `--danger` (vermelho) sinalizando "click vai remover". Sem mais selector `:disabled` aplicado ao action button — só sobreviveu como fallback genérico. |

### UX nova vs. UX anterior

| Aspecto | Rodada 24 (antes) | Rodada 25 (depois) |
|---|---|---|
| Chip bar acima de #messages | Sim, mostrava cada skill ativa com botão × | **Removida** — apenas o badge no botão `+ Skills` |
| Remover skill | Click no × do chip | Click no ✓ dentro do menu (vira `×` no hover) |
| Item ativo no menu | `✓` desabilitado, fica na ordem original | `✓` verde clicável, pinta a linha inteira com stripe verde, fica no **topo** da lista |
| Ordenação ao abrir menu | Apenas a ordem da biblioteca (alfabética) | Ativas primeiro (ordem de ativação) + inativas depois (ordem da biblioteca) |
| Reordenação ao toggle | Não acontecia | Snapshot é fixo enquanto o menu está aberto — recalcula só na próxima abertura |

### Como verificar (delta da Rodada 24)

1. Reload Window.
2. Em qualquer chat, **não deve haver nada visualmente** acima da área de
   mensagens — só o stream de mensagens direto.
3. Click no `+ Skills` → menu abre.
4. Click no `+` de uma skill → ela pula pro **topo da lista** com `✓`
   verde, fundo realçado e stripe vertical à esquerda. O badge no botão
   sobe 1.
5. Hover no `✓` da skill ativa → botão fica **vermelho** (indica que
   click vai remover).
6. Click no `✓` → ela volta pra posição original na lista, vira `+` de
   novo. Badge cai 1.
7. Adiciona 3 skills A, B, C em ordem. Fecha o menu (`Esc` ou click fora).
   Reabre o menu → A, B, C aparecem no topo nessa ordem; depois vem o
   resto da biblioteca alfabético.
8. **Persistência** continua funcionando: retomar uma sessão do histórico
   restaura `activeSkills` e o badge.

### O que foi mantido da Rodada 24

- Pasta `~/.openclaude/skills/` vazia + `~/.openclaude/skills.library/` com a biblioteca completa
- Backend (handlers `addSkill`/`removeSkill`/`getAvailableSkills`, injeção em `sendUserMessage`, `session.activeSkills` na sessão)
- Path-traversal guard em `loadSkillContent`
- Cache cliente-side da library
- Badge contador no `+ Skills`

---

## Rodada 26 — Fase 2D: modos reais + orçamento adaptativo de tools

### Motivação

Até aqui, `single` e `swarm` eram diferentes mais no discurso do que na
execução: o processo do OpenClaude nascia igual nos dois casos, e o modo
`swarm` só ganhava um prefixo textual no prompt. Isso deixava Ruflo visível
mesmo em chats `single` e fazia provedores com limite rígido de ferramentas,
como Groq, falharem antes de responder.

### Mudanças

| Arquivo | Mudança |
|---|---|
| `src/services/model-capabilities.js` | Novo resolvedor de capacidade por provider/modelo. Groq usa limite total de 128 tools; Anthropic nasce com orçamento maior; perfis podem sobrescrever limites no futuro. |
| `src/services/ruflo-tool-policy.js` | Nova política que prioriza tools essenciais do Swarm e corta o excedente conforme o orçamento do modelo. |
| `src/services/ruflo-service.js` | Novo `getToolCatalog()` lendo o catálogo real com `claude-flow mcp tools --format json`, com cache. |
| `src/openclaude-view-provider.js` | O runtime agora é montado por sessão. `single` nasce com MCP vazio; `swarm` nasce com `claude-flow` e denylist adaptativa. A troca `single ↔ swarm` reinicia o processo por trás da mesma conversa, preservando contexto recente via prompt invisível. |
| `src/openclaude-view-provider.js` | Warnings `[context] Warning: ...` deixaram de virar cards vermelhos de erro. |
| `media/webview.js` / `media/webview.css` | O chip solicitado mostra spinner enquanto o runtime troca; os botões ficam bloqueados até o backend confirmar. |
| `scripts/smoke-session-capabilities.js` | Novo smoke test para orçamento de tools e seleção adaptativa. |
| `scripts/smoke-backend.js` | Cobertura nova para runtime `single`, rebuild invisível e `swarm` com seleção de tools. |
| `scripts/smoke-ruflo-service.js` | Cobertura nova para leitura do catálogo real de tools. |
| `package.json` | `npm run smoke` inclui o novo teste de capacidades. |

### Comportamento novo

- `single`
  - abre um runtime limpo, sem MCP do Ruflo exposto
- `swarm`
  - abre um runtime com Ruflo exposto
  - limita automaticamente quantas tools ficam visíveis conforme o orçamento
    do modelo ativo
- troca entre modos
  - mantém a mesma tela e o mesmo transcript
  - reinicia só o processo oculto
  - injeta um resumo recente invisível para o novo runtime continuar o fio da
    conversa

### Validação

- `node --check`
  - `src/services/model-capabilities.js`
  - `src/services/ruflo-tool-policy.js`
  - `src/services/ruflo-service.js`
  - `src/openclaude-view-provider.js`
  - `media/webview.js`
  - `scripts/smoke-session-capabilities.js`
- `npm run smoke`
  - `backend smoke passed`
  - `ruflo service smoke passed`
  - `openclaude paths smoke passed`
  - `session capabilities smoke passed`

---

## Rodada 27 — Hotfix da Fase 2D: limites de saída por modelo

### Motivação

Depois da Rodada 26, `single` já abria sem Ruflo, mas o teste real com
`meta-llama/llama-4-scout-17b-16e-instruct` no Groq revelou outro default
incompatível do OpenClaude: como o modelo não existe no catálogo interno dele,
o runtime pedia `32000` tokens de resposta, enquanto o endpoint do Groq aceita
no máximo `8192`.

### Mudanças

| Arquivo | Mudança |
|---|---|
| `src/services/model-capabilities.js` | O resolvedor agora conhece também `maxOutputTokens`; o Llama 4 Scout no Groq foi cadastrado com `contextWindow=131072` e `maxOutputTokens=8192`. Perfis podem sobrescrever `contextWindow` e `maxOutputTokens` no futuro. |
| `src/constants.js` | O saneamento de env passou a limpar também `CLAUDE_CODE_OPENAI_CONTEXT_WINDOWS`, `CLAUDE_CODE_OPENAI_MAX_OUTPUT_TOKENS` e `CLAUDE_CODE_MAX_OUTPUT_TOKENS` entre sessões. |
| `src/openclaude-view-provider.js` | `buildEnv()` injeta automaticamente os limites conhecidos no formato que o próprio OpenClaude já suporta, removendo o warning de metadata desconhecida e impedindo requests acima do limite aceito pelo provider. |
| `scripts/smoke-session-capabilities.js` | Cobertura nova para `maxOutputTokens`. |
| `scripts/smoke-backend.js` | Cobertura nova garantindo que o env do Groq carrega as duas tabelas adaptativas de runtime. |

### Validação

- `node --check`
  - `src/services/model-capabilities.js`
  - `src/openclaude-view-provider.js`
  - `scripts/smoke-backend.js`
  - `scripts/smoke-session-capabilities.js`
- `npm run smoke`
  - `backend smoke passed`
  - `ruflo service smoke passed`
  - `openclaude paths smoke passed`
  - `session capabilities smoke passed`

---

## O que NÃO foi alterado e por quê

- **Paleta `--oc-sun-*` em `:root`** (linhas 53–59 do CSS) e seus usos em botões
  primários, gradientes do banner e do logo: é identidade visual proposital
  ("OpenClaude sunset"). Trocar por `var(--vscode-*)` apagaria a marca.
- **`box-shadow: 0 0 0 1px ...` simulando borda em `.permission-btn.active`,
  `.permission-btn[data-mode='plan'].active`, `.permission-btn-danger.active`**:
  a Fase 2.2 pede border explícita em vez de box-shadow, mas como o estado base
  do `.permission-btn` tem `border: none`, trocar para `border` exigiria
  refatorar todos os estados (com `border: 1px solid transparent` no normal)
  para evitar "pulo" de 1px ao ativar. Marquei como follow-up; o visual atual
  já está nítido.
- **`extension.js`**: a lógica do backend (control_requests para
  `set_max_thinking_tokens` e `set_permission_mode`) já estava correta. Os bugs
  reportados eram todos no front-end (feedback visual / posicionamento). Não
  toquei.
- **Trigger de autocomplete após espaço** (`/` no meio do texto): a Fase 3.4
  sugere detectar `/` após espaço também, mas o comportamento atual (apenas
  como primeira palavra) é o padrão de Claude Code e evita ambiguidades.
  Pode ser adicionado depois se quiser.

---

## FASE 4 — Validação manual (depende de você)

Não consigo abrir o Extension Host do VSCode a partir desta sessão, então a
verificação fica com você. Reinicie a janela do VSCode (`Developer: Reload Window`)
para carregar o webview novo e teste:

1. **Tema dinâmico.** Troque entre Dark+, Light+, e Default High Contrast
   (`Ctrl+K Ctrl+T`). A extensão deve adaptar fundo/texto/bordas automaticamente
   — só a paleta sunset (logo, botão "Iniciar novo chat", toggle Thinking
   ativo) deve permanecer com a cor própria.
2. **Encaixe na sidebar.** Arraste a borda da sidebar direita para vários
   tamanhos. Não deve aparecer scrollbar horizontal nem corte de elementos.
3. **Botão Thinking.** Em uma sessão de chat, clique no toggle "Thinking". Ele
   deve ficar laranja (sunset) **imediatamente**. Abra DevTools (`Help` →
   `Toggle Developer Tools` → console) e veja `[Thinking] enabled (session …)`.
4. **Modos de permissão.** Clique em cada um dos 4 botões (Default / Accept /
   Plan / Bypass). Cada um deve ficar com `.active` (cor de acento) **na hora**,
   e o console deve mostrar `[PermissionMode] default` / `acceptEdits` / `plan`
   / `bypassPermissions` respectivamente — 4 logs distintos.
5. **Painel de comandos pelo botão.** Clique no ícone de comandos à direita
   das chips de permissão. O painel deve abrir **acima** do composer, listando
   todas as categorias (`Sistema`, `Sessão`, `Modelo`, `Workspace`, `Workflow`,
   `Avançado`, `Diagnóstico`, `Auth`). Console: `[CommandsMenu] open
   (unfiltered)`.
6. **Autocomplete com `/`.** No textarea, digite `/`. A lista deve aparecer
   acima do input. Digite `/co` — só os comandos começando com `co` ficam.
   `Esc` fecha; `↑/↓` navega; `Enter`/`Tab` seleciona.
7. **Botões pastel.** Para ver Approve/Deny/Suggest na prática, peça ao Claude
   uma ação que requeira permissão (ex.: editar arquivo) com a sessão em
   `Default`. O prompt de permissão renderizado abaixo da resposta deve mostrar
   os três botões com tons pastel e suavidade no normal, escurecendo um pouco
   no hover.

Se algum dos 7 testes falhar, me chame de volta com:
- O que falhou (qual passo)
- O que o console mostrou (qualquer `[Thinking] …`, `[PermissionMode] …`, ou
  erros vermelhos)
- Print da sidebar se for visual

---

## Próximo passo (se você quiser subir para o GitHub)

A extensão hoje vive em `~/.vscode/extensions/…` — para virar projeto fixo no
seu GitHub, recomendo:

1. Copiar o conteúdo (sem `node_modules`) para uma pasta nova fora de
   `.vscode/extensions/`, ex.: `~/Documents/openclaude-tools/`.
2. Adicionar um `.gitignore` excluindo `node_modules/`, `*.vsix`, `out/`.
3. `git init`, primeiro commit, criar repo no GitHub e push.
4. Opcionalmente, configurar um build script (`vsce package`) para empacotar a
   extensão em `.vsix` para distribuição.

Quando quiser, me peça que eu monto essa estrutura.

# CONTEXT — Extensão Open Claude × Integração Ruflo

> **Propósito deste documento**: dar a uma IA (ou desenvolvedor humano) o
> contexto necessário pra retomar este projeto sem ter lido nenhuma das
> sessões anteriores. Lê este arquivo inteiro **antes** de tocar qualquer
> código.

**Última atualização**: 2026-05-16
**Localização do projeto**: `C:\Users\Leonardo\.vscode\extensions\leonardo.openclaude-tools-0.0.1\`
**Status**: Pre-Ruflo + Fases 0, 1, Bônus, 2A, 2B, 2C e 2D completas. Validação de controles concluída. Refatoração estrutural inicial concluída e estabilizada com smoke test. A próxima etapa real é a Fase 3 do Ruflo interno.

---

## 1. Visão geral — O que é o projeto

### 1.1 O que é a extensão "Open Claude"

Extensão VSCode personalizada (não-pública) criada pelo usuário Leonardo
(`leonardosaracino@id.uff.br`). Ela é um **frontend visual** para um CLI
chamado **`openclaude`** (`openclaude.cmd`), instalado globalmente em
`C:\Users\Leonardo\AppData\Roaming\npm\openclaude.cmd`.

A `openclaude` CLI é uma derivação/fork do Claude Code CLI da Anthropic,
mas:
- **NÃO depende** do Claude Code oficial estar instalado
- Suporta múltiplos providers de LLM (Anthropic, OpenAI, GitHub Models,
  Gemini, Mistral, Bedrock, Vertex, Foundry, xAI, Codex) via env vars
- Tem protocolo JSONL stdin/stdout que a extensão consome via
  `child_process.spawn`

### 1.2 Arquitetura macro

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Window                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Open Claude extension (webview view container)         │  │
│ │  ┌──────────────────────────────────────────────────┐  │  │
│ │  │ webview.html (rendered server-side em            │  │  │
│ │  │   src/webview-html.js)                            │  │  │
│ │  │   ↕ vscode.postMessage / onDidReceiveMessage     │  │  │
│ │  │ webview.js  (cliente, dentro do iframe)          │  │  │
│ │  │ webview.css (estilos)                            │  │  │
│ │  └──────────────────────────────────────────────────┘  │  │
│ │                  ↑ JSONL stdio                         │  │
│ └─────────────────┼──────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │
        ┌───────────▼─────────────┐
        │ child_process: openclaude.cmd
        │   --print --verbose
        │   --input-format=stream-json
        │   --output-format=stream-json
        │   --include-partial-messages
        │   --permission-prompt-tool stdio
        │   --permission-mode <mode>
        │   --model <profile.model>
        └───────────┬─────────────┘
                    │ API call (Anthropic/OpenAI/Gemini/etc.)
                    ▼
                ┌─────────────┐
                │  LLM provider
                └─────────────┘
```

### 1.3 Tech stack

| Camada | Tecnologia |
|---|---|
| Plataforma | VS Code Extension API (`engines.vscode: ^1.90.0`) |
| Backend (Node) | Node.js >= 20, `child_process`, `vscode` module |
| Frontend (webview) | HTML + CSS + Vanilla JS (sem React/Vue/etc.) |
| Comunicação extension↔webview | `postMessage` / `onDidReceiveMessage` |
| Comunicação extension↔CLI | JSONL via `stdin.write` / `stdout` parsing |
| Persistência de profiles/sessions | `vscode.ExtensionContext` (globalState) + Secret Storage |

### 1.4 Estrutura de arquivos atual

```
leonardo.openclaude-tools-0.0.1/
├── extension.js              ← Entry point mínimo (~40 linhas)
├── package.json              ← Manifest da extensão
├── package-lock.json
├── node_modules/             ← Deps (poucas, principalmente prebuild-install)
├── src/
│   ├── constants.js          ← Constantes globais de sessão/profiles/Ruflo
│   ├── utils.js              ← Helpers compartilhados
│   ├── commands.js           ← Fluxos de Quick Pick/Input Box
│   ├── webview-html.js       ← HTML server-side da webview
│   ├── openclaude-view-provider.js ← Classe principal de sessão/chat
│   ├── services/
│   │   ├── openclaude-paths.js ← Caminhos, migração e ponte `.openclaude`
│   │   ├── model-capabilities.js ← Limites/capacidades por provider/modelo
│   │   ├── ruflo-tool-policy.js ← Seleção adaptativa das tools do Ruflo
│   │   └── ruflo-service.js   ← Status, catálogo e ações administrativas do Ruflo
│   └── stores/
│       ├── profile-store.js
│       ├── skills-and-agents-store.js
│       └── history-store.js
├── scripts/
│   ├── smoke-backend.js      ← Teste de fumaça dos fluxos críticos do backend
│   ├── smoke-ruflo-service.js← Teste isolado do serviço Ruflo
│   └── smoke-openclaude-paths.js ← Migração e compatibilidade `.openclaude`
├── media/
│   ├── webview.css           ← Estilos (1870+ linhas)
│   ├── webview.js            ← Frontend JS (1450+ linhas)
│   └── openclaude.svg        ← Ícone do activity bar
├── RESEARCH.md               ← Fase 0 (pesquisa Ruflo) — gerado em sessão
├── CHANGES.md                ← Diário de mudanças por rodada — gerado em sessão
└── CONTEXT.md                ← Este arquivo
```

Ainda não há `tsconfig.json` nem `.git` — é o bundle instalado diretamente
em `.vscode/extensions/`. Desde a Rodada 12 já existe `src/` para separar
responsabilidades do backend. O usuário quer eventualmente migrar isso pra um
repositório GitHub adequado (com estrutura de fonte separada do build).

---

## 2. Objetivo principal da sessão atual

**Integrar o Ruflo (https://github.com/ruvnet/ruflo) na extensão Open Claude
de forma INDEPENDENTE do Claude Code oficial da Anthropic.**

Ruflo é uma plataforma de orquestração de agentes ("AI Agent Orchestration
Platform") publicada no npm como `@claude-flow/cli` — o binário se chama
`claude-flow` (NÃO `ruflo`, apesar do help imprimir "RuFlo V3"). Ela
oferece:
- ~210 ferramentas MCP (swarm coordination, memory, hooks, agents)
- AgentDB com HNSW (memória vetorial persistente)
- 100+ agentes especializados
- Daemon de background workers (audit, optimize, testgaps, etc.)
- Federation entre máquinas (mTLS, PII stripping)
- Multi-LLM (Anthropic, OpenAI, Gemini, Cohere, Ollama)
- Licença MIT

### 2.1 Decisão chave: caminhos de integração

Três caminhos possíveis foram analisados:

| Caminho | Como funciona | Veredito |
|---|---|---|
| **A — MCP server** | `openclaude mcp add claude-flow -- claude-flow mcp start`. O LLM da sessão chama as ~210 tools do Ruflo quando decide útil. | **Escolhido.** Não exige Claude Code, multi-provider funciona, integra na UI existente. |
| **B — Plugin Claude Code** | `/plugin install ruflo-core@ruflo` no Claude Code da Anthropic. | **Rejeitado.** Depende do plugin system do Claude Code oficial, que o usuário não quer usar. |
| **C — CLI standalone via terminal** | Botão na extensão abre terminal integrado rodando `claude-flow`. | **Adotado como complemento** (Fase Bônus). Dá acesso a 100% das funcionalidades do CLI sem reescrever a extensão. |
| **D — Embedar Ruflo em `extension.js`** | Reescrever a extensão chamando libs internas do Ruflo (`ruvector`, AgentDB) em-processo. | **Rejeitado.** Depende de Rust opcional, Docker, MongoDB, 27 hooks — equivaleria a reescrever a extensão. |

### 2.2 Modelo mental "Modo × Permission"

Conceito introduzido na Fase 1 e **refatorado na Rodada 10** — dois eixos
**estritamente ortogonais** que controlam a sessão. Não há mais pareamento
implícito: mudar um eixo nunca afeta o outro.

| Eixo | O que controla | Valores |
|---|---|---|
| **Modo** | **QUEM responde** | `single` (um LLM responde) · `swarm` (LLM usa MCP do Ruflo pra orquestrar agentes) |
| **Permission** | **COMO o agente age** | `default` · `acceptEdits` · `plan` · `bypassPermissions` |

Função helper `normalizeSessionMode(mode)` em `extension.js` converte
valores legacy: `'default'`/`'plan'` → `'single'`, `'ruflo'` → `'swarm'`.
Sessões pré-Rodada-10 funcionam sem regressão.

Combinações válidas (todas fazem sentido):
- `single + default/accept/plan/bypass` — LLM único com cada nível de permissão
- `swarm + default/accept/plan/bypass` — swarm Ruflo com cada nível de permissão

**"Plan" como modo deixou de existir** (Rodada 10) — era duplicação 1:1
com `permissionMode='plan'`. Pra obter "LLM só planeja" hoje, mantenha
`mode='single'` e escolha `permissionMode='plan'`.

---

## 3. Histórico das rodadas (1-12)

Cada rodada é um "commit lógico" da conversa com o usuário. Detalhes
completos estão em [CHANGES.md](./CHANGES.md). Resumo aqui:

### Rodada 1 — Setup inicial (Fases 0-3 do plano original)

Plano original era "melhorias visuais + correção de bugs", **antes** da
integração Ruflo. Entregues:

- **Fase 0** (pesquisa): RESEARCH.md sobre Ruflo
- **Fase 1** (mapeamento): identificou que webview.css já usava `var(--vscode-*)`
  na maior parte, faltavam edits cirúrgicos
- **Fase 2.1** (cores hardcoded): 2× `color: #fff` → `var(--vscode-button-foreground, #fff)`
- **Fase 2.3** (encaixe): `body { width: 100vw → 100% }` (evita scrollbar overflow)
- **Fase 2.4** (botões pastel): `.permission-approve/.deny/.suggest` de hex saturados → tons pastel
- **Fase 3.3+3.4** (bug único): removeu `overflow: hidden` de `.composer-area` que estava clipando o `.slash-menu` que sobe via `bottom: calc(100% - 4px)`
- **Fase 3.1** (Thinking toggle): update otimista do `aria-pressed` + `console.log('[Thinking]', ...)`
- **Fase 3.2** (4 botões permission): update otimista de `.active` + `console.log('[PermissionMode]', mode, ...)`

### Rodada 2 — UI seguindo tema VSCode + alinhamento bottom (parte 1)

Usuário reportou que UI não seguia tema. Diagnóstico: `.shell` usava
`background: color-mix(in srgb, var(--bg) 92%, var(--text) 8%)` que
neutralizava o tom. Trocado pra `background: transparent`.

Botões pastel da Fase 2.4 estavam em `hsl()` fixo (não seguia tema).
Trocados pra `color-mix` com `var(--vscode-testing-iconPassed/Failed/badge-background)` + fallback hsl.

### Rodada 3 — Remoção das "ilhas" internas

Usuário reportou que UI não alinhava com sua custom UI (Apc/Island Dark).
Diagnóstico: havia **3 caixas internas** com border + border-radius +
background próprios:
- `.toolbar` (linha ~228)
- `.body` (linha ~476)
- `.composer` (linha ~1697)

Removidas as 3 caixas. Agora flush com a sidebar igual Cline/Continue/Roo.

### Rodada 4 — Safe area no bottom

Após Rodada 3, histórico recente "vazava" pra baixo da custom UI.
Diagnóstico:
1. `.body` perdeu altura explícita ao remover border/background
2. `.home` e `.messages` esbarravam pixel-perfeito no fundo da sidebar
   (onde a custom UI desenha o canto arredondado)

Fixes:
- `.body { height: 100% }`
- `.home { padding-bottom: calc(var(--space-5) + 16px) }`
- `.messages { padding-bottom: calc(var(--space-2) + 8px) }`

### Rodada 5 — Fase 0 + Fase 1 + Fase Bônus do Modo Ruflo

Início da integração Ruflo propriamente dita. Entregues:

- **Fase 0** (detector ambiente): método `checkRufloEnvironment()` que probe
  CLI instalada, MCP registrado, daemon up. Pill `#rufloStatusPill` no
  toolbar com 5 estados visuais (unknown/off/installed/mcp/daemon/checking).
- **Fase 1** (chip switcher Modo): constantes `SESSION_MODES`,
  `setSessionMode`, handler `setMode`, chip group HTML, refs JS,
  listener com update otimista, CSS `.mode-btn` com variante sunset
  pra ruflo, prefixo `RUFLO_PROMPT_PREFIX` injetado em `sendUserMessage`
  quando `mode === 'ruflo'`.
- **Fase Bônus** (terminal CLI): método `openRufloCli()` que monta env
  via `buildEnv(profile, apiKey)` (mesmo provider env do openclaude),
  cria terminal integrado VSCode, força shell Windows quando aplicável.
  Comando `leonardo.openRufloCli` registrado em `activate()` e no
  `package.json`.

### Rodada 6 — Hotfix: nome real do pacote

Usuário reportou que `npx ruflo@latest` dava `ERR_INVALID_URL`.
Descoberta: o pacote npm não se chama `ruflo` — é `@claude-flow/cli`.
"Ruflo" é só a marca/produto. Trocadas 4 chamadas.

Bonus: forçado shell `cmd.exe` no terminal "Ruflo CLI" (era WSL default
do usuário, que tem npm Linux e env vars Windows não funcionariam direito).

### Rodada 7 — Hotfix: bin name correto

Usuário reportou `'cli' não é reconhecido como um comando interno` após
download bem-sucedido. Causa: `npx -y @claude-flow/cli@latest` infere
bin do último segmento do pacote (`cli`), mas o pacote define o bin
como `claude-flow`. Fix: usar `-p <pkg> <bin>` explícito em 3 lugares.

### Rodada 8 — Hotfix: PATH do npm global

Após `npm install -g @claude-flow/cli` (recomendado pelo assistant), o
binário `claude-flow.cmd` ficou em `C:\Users\Leonardo\AppData\Roaming\npm\`
mas o detector da extensão não achava — o `execAsync` herdava PATH do
processo do VSCode que não incluía npm global.

Fix:
- `checkRufloEnvironment` agora prepende `%APPDATA%\npm` à PATH do probe
  env. Tenta `claude-flow --version` direto primeiro (instantâneo se
  global), fallback pra `npx -p` se direto falhar.
- `openRufloCli` faz o mesmo no env do terminal.
- Comando inicial do terminal trocado de `npx -p @claude-flow/cli@latest claude-flow`
  (que mostrava help e voltava ao prompt) pra `claude-flow doctor` (que
  dá diagnóstico útil do ambiente).

### Rodada 10 — Reorganização da chat-controls bar (Opção A)

Usuário identificou que Modo (Default/Plan/Ruflo) duplicava conceitos com
Permission (Default/Accept/Plan/Bypass). Decisão: colapsar Modo para 2
valores binários (`single`/`swarm`), remover todo pareamento implícito,
deixar os dois eixos totalmente ortogonais.

- Constantes atualizadas: `SESSION_MODES = ['single', 'swarm']`
- Helper `normalizeSessionMode` adicionado pra compat com sessões antigas
- `setSessionMode` simplificado (sem side-effects em `permissionMode`)
- HTML do chip group: 3 botões → 2 (Single + Swarm)
- Aria-label "Quem responde" (mais descritivo)
- Detalhes completos em [CHANGES.md](./CHANGES.md) Rodada 10.

### Rodada 11 — Controles confiáveis + Bypass funcional

Validação direta contra o `openclaude` real em modo `stream-json` confirmou
que `default`, `acceptEdits`, `plan` e `Thinking` já chamavam as rotas certas.
Descoberta: `bypassPermissions` era rejeitado porque a extensão não iniciava o
processo com `--allow-dangerously-skip-permissions`.

Fixes:
- spawn do OpenClaude agora inclui `--allow-dangerously-skip-permissions`
  para deixar o modo Bypass disponível sem ativá-lo por padrão
- Permission/Thinking deixaram de fazer update otimista no webview
- `control_response` agora é tratado no backend; estado só muda depois de
  confirmação real do runtime, e rejeições mostram erro ao usuário

### Rodada 12 — Refatoração estrutural do backend

Antes de avançar para o Ruflo interno, o backend foi dividido em módulos sem
mudar comportamento:
- `constants`, `utils`, `commands`, `webview-html`
- `openclaude-view-provider`
- `stores/profile-store`, `stores/skills-and-agents-store`,
  `stores/history-store`
- `extension.js` caiu de ~3860 para ~40 linhas e virou apenas o entry point
- a classe `OpenClaudeViewProvider` foi movida para arquivo próprio em `src/`
- todos os arquivos novos passaram em `node --check`

### Rodada 13 — Hotfix pós-refatoração + smoke test

A primeira extração deixou alguns imports usados pela classe principal para
trás. Os logs reais do Extension Host mostraram falhas em `sendHydrate`,
`openRufloCli` e `createSession` por helpers ausentes.

- imports restaurados em `src/openclaude-view-provider.js`
- `configureProfileApiKey` passou a ser exportado por `src/commands.js`
- criado `scripts/smoke-backend.js`
- criado `npm run smoke` para testar hydrate, profiles, novo chat, Ruflo CLI,
  Modelos, Skills e parsing básico do protocolo

### Rodada 9 — Probe MCP per-project

Usuário registrou MCP via `openclaude mcp add claude-flow -- claude-flow mcp start`,
mas pill continuou amarelo ("instalado") em vez de azul ("MCP ativo").
Diagnóstico do output:
```
File modified: C:\Users\Leonardo\.claude.json [project: D:\TCC_oficial\TCC-MOTIVA-APP]
```

O openclaude registra MCPs **per-project** (scope pelo cwd). O probe
`openclaude mcp list` usava cwd herdado do processo do VSCode em vez do
workspace folder.

Fix: passar `cwd: getWorkspaceCwd()` + `env: probeEnv` no exec do probe.
Timeout subido de 5s → 8s porque o `openclaude mcp list` inicializa o
banner do chat antes de imprimir a lista.

---

## 4. Estado atual do código

### 4.1 Arquivos tocados nas 12 rodadas

| Arquivo | Linhas aproximadas | Tipo de mudança |
|---|---|---|
| `extension.js` | 40+ | Entry point mínimo + registro de comandos |
| `src/constants.js` | 100+ | Constantes globais de sessão, profiles e Ruflo |
| `src/utils.js` | 540+ | Helpers compartilhados de sessão, histórico, parsing e renderização |
| `src/commands.js` | 440+ | Wizards de profiles, skills e agents |
| `src/webview-html.js` | 170+ | HTML server-side da webview |
| `src/openclaude-view-provider.js` | 1800+ | Orquestração principal de sessão/chat |
| `src/stores/*.js` | 900+ somadas | Persistência de profiles, skills/agents e histórico |
| `src/services/ruflo-service.js` | 250+ | Detector confiável + ações administrativas do Ruflo |
| `scripts/smoke-backend.js` | 300+ | Smoke test dos fluxos críticos pós-refatoração |
| `scripts/smoke-ruflo-service.js` | 100+ | Smoke isolado do serviço Ruflo |
| `media/webview.css` | 1870+ | Refactor visual extenso (rodadas 1-4), CSS dos novos elementos Ruflo (pill, mode-btn) |
| `media/webview.js` | 1450+ | Refs e listeners do pill + chip switcher + telas do Ruflo |
| `package.json` | 130+ | Comando `leonardo.openRufloCli` registrado em `activationEvents`, `commands`, `commandPalette` |

### 4.2 Funcionalidades existentes adicionadas pelo projeto

1. **Pill de status do Ruflo no toolbar** — `#rufloStatusPill`
   - 8 estados visuais via `data-state` attribute:
     `unknown` / `off` / `installed` / `warning` / `mcp` / `daemon` /
     `checking` / `busy`
   - Cores: cinza → amarelo → azul → verde com glow → cinza pulsando
   - Click abre um dropdown com ações administrativas
   - Tooltip mostra os sub-estados individualmente
   - Quando falta alguma peça do setup completo, o dropdown mostra primeiro um
     único botão `Ativar Ruflo`

2. **Página de configuração Ruflo** — `#rufloSettings`
   - Seções para estado, projeto atual, daemon, memória, ferramentas e detalhes
   - Permite registrar/remover MCP, iniciar/parar daemon, inicializar/apagar
     memória, rodar diagnóstico e abrir CLI sem depender do terminal
   - Botões ficam desabilitados quando a CLI não está disponível
   - A memória detecta quando já existe e troca `Inicializar` por
     `Inicializada`

3. **Chip switcher de Modo** — `.mode-group` no chat-controls
   - **2 botões** (após Rodada 10): Single · Swarm
   - O botão Swarm carrega classe `.mode-btn-ruflo` (paleta sunset quando ativo — nome
     da classe é legado e poderia virar `.mode-btn-swarm` em refactor futuro)
   - Update otimista da `.active` no click
   - `aria-label` do group: "Quem responde"

4. **Ação "Abrir CLI" do Ruflo**
   - Disponível no menu do pill, na tela de configuração e no Command Palette
   - Abre terminal integrado com env vars do profile ativo
   - Comando inicial: `claude-flow doctor` (diagnóstico)
   - Shell forçado: cmd.exe no Windows

5. **Notificação de delete chat como toast nativa** (não mais modal centralizado)

6. **Prefixo invisível em Modo Ruflo** — `RUFLO_PROMPT_PREFIX` injetado no
   conteúdo enviado ao LLM (não aparece no transcript da UI)

### 4.3 Anti-padrões evitados / NÃO fazer

- ❌ NUNCA use `npx ruflo@latest` (pacote não existe com esse nome)
- ❌ NUNCA assuma que `npx -y @claude-flow/cli@latest` infere o bin
  corretamente — sempre usar `-p @claude-flow/cli@latest claude-flow`
- ❌ NUNCA spawne child processes sem prepender `%APPDATA%\npm` na PATH
  no Windows — `claude-flow.cmd` não vai ser encontrado
- ❌ NUNCA assuma que `openclaude mcp list` mostra todos os MCPs — ele
  é per-project, depende do cwd
- ❌ NUNCA chame `openclaude mcp add` esperando que o processo termine
  rápido — ele inicializa o banner do chat completo
- ❌ NUNCA reintroduza `overflow: hidden` em `.composer-area` (clipa o
  slash menu)
- ❌ NUNCA reintroduza border/border-radius/background nas 3 caixas
  internas (`.toolbar`, `.body`, `.composer`) — re-cria o efeito "ilha"
- ❌ NUNCA use `color-mix` na `.shell` background (neutraliza o tema)
- ❌ NUNCA dependa de `vscode.window.createTerminal` shell default —
  pode ser WSL no usuário e quebrar env Windows

---

## 5. Dúvidas que o usuário levantou (cronológico)

Para uma IA assumindo este projeto: estas foram as perguntas REAIS do
usuário ao longo do trabalho. Manter elas em mente ajuda a calibrar o
nível de explicação e antecipar dúvidas futuras.

### 5.1 Sobre Ruflo (conceitual)

1. **"O MCP do Ruflo funciona como uma skill? Ele ainda vai rodar
   automaticamente vários agentes, salvar histórico, ir aprendendo?"**
   - Resposta dada: MCP ≠ skill. MCP expõe tools que o LLM pode chamar.
     Swarm, memória, aprendizado funcionam, **mas o gatilho é o LLM
     decidir chamar a tool** (não autônomo como na CLI standalone).

2. **"O Ruflo + daemon teria as mesmas funcionalidades do Ruflo CLI?"**
   - Resposta: ~90%. Faltam: controle proativo da conversa (Ruflo
     intervindo sozinho), smart-routing automático entre LLMs, Web UI
     integrada.

3. **"Eu consigo usar o openclaude com a API que quiser no Ruflo?"**
   - Resposta: Sim, qualquer provider que o openclaude já suporta.

4. **"Qual a diferença de eficiência e funcionalidade entre CLI standalone
   e MCP + daemon?"**
   - Resposta: CLI standalone é ~30% mais barata em tokens e ~25% mais
     rápida em tarefas multi-agente; mas MCP+daemon ganha em UX
     integrada, flexibilidade de provider e coexistência com outras
     tools.

5. **"Eu conseguiria embedar o Ruflo CLI inteiro na extensão?"**
   - Resposta: Não sem reescrever — Ruflo não tem modo JSON-stdio
     headless documentado. Alternativa adotada: botão que abre terminal
     integrado.

6. **"Tudo isso é independente do Claude Code? Se eu desinstalar Claude
   Code, vai continuar funcionando?"**
   - Resposta: Sim. OpenClaude usa `openclaude.cmd` próprio. Ruflo via
     MCP fala direto com a API do provider escolhido.

### 5.2 Sobre o plano de desenvolvimento

7. **"Vamos começar pela Fase 0 e ir até a Fase 2+ passando por todas
   elas"** — Decisão original de ordem: 0 → 1 → Bônus → 2 → 3 → 4.

8. **"Vamos remover do nosso planejamento tudo que estiver envolvido com
   o Claude Code. A não ser que a gente consiga fazer funcionar no
   OpenClaude, aí sim vamos elaborar isso."**
   - Implicação: descartar `/plugin install ruflo-core@ruflo` e
     qualquer feature que assume sistema de plugins do Claude Code.
     Manter: MCP, daemon, CLI direto (Caminhos A + C, descartar B).

### 5.3 Sobre integração visual com VSCode/custom UI

9. **"A UI continua sem padronizar com o tema do VSCode."**
   - Diagnóstico: `.shell` usava `color-mix` neutralizando tema. Trocado.

10. **"A extensão não está alinhada na parte de baixo com a custom UI."**
    - Diagnóstico: 3 caixas internas criavam efeito "ilha". Removidas.

11. **"O texto do histórico foge para baixo da minha UI."**
    - Diagnóstico: `.body` perdeu altura ao remover background.
      Adicionado `height: 100%` + safe area.

12. **"Por que você precisa criar uma ilha? Outras extensões também
    criam ou o material da extensão já fica na sidebar?"**
    - Resposta: outras (Cline, Continue, Roo, Copilot Chat) ficam flush.
      Era escolha estética do autor. Removido.

### 5.4 Sobre o ambiente (instalação Ruflo)

13. Diversos erros de instalação resolvidos com clean cache + global
    install (vide Rodadas 6-9).

14. **"O Ruflo CLI pode virar dropdown/página de configuração?"**
    - Resposta: sim. Isso não substitui o Swarm; é a camada de
      administração visual do `claude-flow`. Decisão nova: essa camada
      entra antes do Ruflo interno para que status, MCP, daemon e setup
      fiquem confiáveis antes de começar a montar times automáticos.

---

## 6. Próximas fases — Plano detalhado revisado

### 6.1 Fase 2A — Administração Ruflo + pill confiável

**Status: concluída na Rodada 17.**

**Motivação**: Antes de aprofundar o Swarm, a extensão precisa saber e
mostrar com precisão qual parte do Ruflo está pronta. Hoje o botão
`Ruflo CLI` é só uma porta para o terminal, e o pill ainda pode ficar
preso em `instalado` quando o problema real é MCP/configuração.

**O que entregar**:
1. Corrigir o detector do pill para distinguir melhor:
   - CLI instalada
   - MCP realmente registrado no workspace atual
   - daemon rodando
   - erro de configuração do OpenClaude ao tentar consultar MCP
2. Trocar o comportamento principal da pill por um **menu dropdown** com:
   - Re-verificar status
   - Registrar/remover MCP do workspace atual
   - Iniciar/parar daemon
   - Rodar diagnóstico
   - Abrir CLI
3. Manter a CLI como ação avançada/manual dentro do menu e da tela de
   configuração, sem botão duplicado na toolbar.
4. Mostrar mensagens mais humanas:
   - "Ruflo instalado, mas ainda não ligado a este projeto"
   - "MCP pronto, daemon desligado"
   - "Falha ao consultar MCP por configuração do provider"

**Componentes técnicos**:
- Backend:
  - fortalecer `checkRufloEnvironment`
  - novos métodos `registerRufloMcp()`, `removeRufloMcp()`,
    `startRufloDaemon()`, `stopRufloDaemon()`, `runRufloDoctor()`
  - retornar também `statusReason` / `lastError`
- Webview:
  - dropdown ancorado no pill
  - estados visuais e copy mais precisos
- Testes:
  - ampliar `npm run smoke` com estados da pill e handlers das ações

**Critérios de pronto**:
- [x] Pill não mostra só `instalado` quando o MCP existe mas a checagem falhou
- [x] Usuário consegue ligar/desligar daemon sem abrir terminal
- [x] Usuário consegue registrar MCP do workspace sem digitar comando
- [x] Cada ação atualiza o estado automaticamente

### 6.2 Fase 2B — Página de configuração Ruflo

**Status: concluída na Rodada 17.**

**Motivação**: Algumas configurações são grandes demais para um dropdown.
Se o `claude-flow` vai ser parte real do produto, ele precisa de uma tela
onde o usuário veja e controle o sistema sem decorar comandos.

**O que entregar**:
1. Nova página/view de configuração Ruflo dentro da extensão
2. Seções:
   - Estado geral: CLI, MCP, daemon, versão
   - Ações rápidas: doctor, reparar setup, abrir CLI
   - MCP por workspace
   - Daemon e workers
   - Memória / inicialização
   - Futuramente: defaults de swarm, agentes preferidos, modelos por papel
3. Ações visuais que por baixo chamam o `claude-flow`/`openclaude`
   necessários, mas sem exigir terminal do usuário

**Critérios de pronto**:
- [x] Existe um ponto central de configuração Ruflo
- [x] As ações mais comuns não exigem terminal
- [x] A CLI continua disponível só como via avançada/manual

### 6.3 Fase 2C — Autonomia `.openclaude`

**Status: concluída na Rodada 23.**

**Motivação**: A extensão não depende do executável oficial Claude Code para
rodar, mas ainda depende de caminhos herdados dele:
- `~/.claude/skills`
- `~/.claude/agents`
- `~/.claude/projects`
- `~/.claude/deleted-history`
- `~/.claude.json`

Isso é aceitável numa fase pessoal de protótipo, mas não para uma extensão
que um dia será instalada por outras pessoas. O OpenClaude precisa ter casa
própria.

**O que já foi descoberto**:
1. O `openclaude` instalado (`@gitlawb/openclaude` 0.8.0) já suporta:
   - `~/.openclaude`
   - `~/.openclaude.json`
   - `.openclaude/settings.json`
2. Como `~/.openclaude` ainda não existe nesta máquina, ele cai de volta para
   `~/.claude` por compatibilidade legacy.
3. Ainda existe uma lacuna upstream:
   - user-level config pode migrar para `.openclaude`
   - mas o carregamento de `skills`/`agents` de projeto ainda procura
     `.claude/skills` e `.claude/agents` no código atual do CLI

**O que entregar nesta fase**:
1. Criar uma camada única de caminhos (`OpenClaudePaths`) para a extensão
2. Tornar `.openclaude` e `.openclaude.json` os caminhos primários
3. Fazer migração controlada de user-level:
   - skills
   - agents
   - histórico/deleted-history
   - config global
4. Manter leitura legacy temporária de `.claude` apenas como ponte de migração
5. Decidir e implementar a estratégia para project-level:
   - ideal: patch/fork do `openclaude` para suportar `.openclaude/skills` e
     `.openclaude/agents`
   - transitório aceitável: bridge compatível enquanto o CLI não suportar isso
6. Só depois seguir para catálogo de agentes e execução de swarm

**Implementação entregue**:
1. `OpenClaudePaths` virou a fonte única de caminhos e roda migração automática
   ao ativar a extensão
2. `.openclaude` / `.openclaude.json` passaram a ser os caminhos canônicos
3. Migração automática cobre:
   - `skills`
   - `agents`
   - `projects`
   - `deleted-history`
   - config global
4. Dados de projeto passam a nascer em `.openclaude`
5. Como o `openclaude` 0.8.0 ainda carrega markdown de projeto a partir de
   `.claude/{commands,agents,output-styles,skills,workflows}`, a extensão cria
   uma ponte automática temporária espelhando o conteúdo canônico de
   `.openclaude` antes de abrir uma sessão

**Critérios de pronto**:
- [x] Novos dados da extensão nascem em `.openclaude`, não `.claude`
- [x] `RufloService` usa `.openclaude.json`
- [x] Skills/agentes user-level passam a usar `.openclaude`
- [x] Histórico novo passa a preferir `.openclaude`
- [x] Existe estratégia explícita para os caminhos de projeto ainda legados
- [x] Documentação não promete independência estrutural antes da hora

### 6.4 Fase 2D — Isolamento real dos modos

**Status: concluída nas Rodadas 26-27.**

**Motivação**: Antes desta fase, `single` e `swarm` eram quase iguais por
baixo. A única diferença real era um prefixo textual no prompt; o processo do
OpenClaude nascia com a mesma superfície de ferramentas em ambos os modos.
Isso fazia `single` ainda carregar Ruflo e quebrava provedores com limite de
tools, como Groq.

**Implementação entregue**:
1. `single` agora nasce com `--strict-mcp-config` e um config MCP vazio
2. `swarm` nasce com um config MCP efêmero contendo só `claude-flow`
3. A troca `single ↔ swarm` faz um rebuild invisível do runtime:
   - a tela e o transcript permanecem
   - o processo por trás é reiniciado
   - um prompt de continuidade invisível preserva o contexto recente
4. O webview mostra spinner no chip de modo enquanto a troca acontece
5. A quantidade de tools do Ruflo exposta no `swarm` passou a ser adaptativa:
   - `model-capabilities.js` resolve orçamento por provider/modelo
   - `ruflo-service.js` lê o catálogo real via `claude-flow mcp tools --format json`
   - `ruflo-tool-policy.js` prioriza as ferramentas úteis ao swarm e nega o
     excesso automaticamente
6. `Groq` ficou cadastrado com orçamento conservador de 128 tools totais,
   deixando 80 slots para MCP após reserva de tools nativas
7. Avisos `[context] Warning: ...` deixaram de virar cards vermelhos de erro
   no chat; agora são tratados como warning/status
8. O runtime passou a injetar metadados adaptativos por modelo para o próprio
   OpenClaude:
   - `CLAUDE_CODE_OPENAI_CONTEXT_WINDOWS`
   - `CLAUDE_CODE_OPENAI_MAX_OUTPUT_TOKENS`
   Isso evita que modelos fora do catálogo interno do OpenClaude caiam em
   defaults incompatíveis, como o Llama 4 Scout no Groq pedindo 32000 tokens
   quando o endpoint aceita no máximo 8192.

**Critérios de pronto**:
- [x] `single` não expõe Ruflo
- [x] `swarm` é o único modo que expõe Ruflo
- [x] Trocar modo mantém a mesma conversa visível
- [x] A UI mostra estado de carregamento durante a troca
- [x] A seleção de tools cresce automaticamente conforme o orçamento do modelo
- [x] Modelos fora do catálogo interno recebem contexto e saída máximos
      compatíveis automaticamente quando a extensão conhece esses limites
- [x] Smoke tests cobrem runtime `single`, runtime `swarm` e capacidades

### 6.5 Fase 3 — Catálogo real de agentes + regras de composição

**Motivação**: Em Modo Swarm, o usuário hoje envia o prompt e o LLM
decide sozinho quais agentes do Ruflo invocar, se invoca. Antes de
executar times automaticamente, a extensão precisa conhecer o catálogo
real de agentes e as funções de cada um.

**O que entregar**:
1. Ler o catálogo real de agentes instalados no pacote Ruflo local
2. Normalizar os agentes por papel:
   - planejamento
   - pesquisa
   - implementação
   - testes
   - revisão
   - segurança
   - arquitetura
3. Criar regras explícitas de composição de times:
   - bug simples
   - feature
   - refatoração
   - auditoria
   - documentação
4. Definir onde entram preferências de usuário e, depois, modelos por papel
5. Manter uma UI inicial de inspeção/seleção manual para você entender e
   ajustar o que o sistema escolheu

**Componentes técnicos**:
- Backend:
  - novo `RufloAgentCatalogStore`
  - ler definições reais dos agentes instalados no pacote atual
  - cachear catálogo normalizado
- Webview JS:
  - visão de catálogo dentro da configuração Ruflo
  - seleção manual inicial quando útil

**Critérios de pronto**:
- [ ] Extensão conhece o catálogo real instalado
- [ ] Cada agente aparece com função compreensível
- [ ] Existe uma tabela de regras "tipo de tarefa -> time sugerido"
- [ ] O usuário consegue inspecionar e ajustar a escolha

### 6.6 Fase 4 — Execução previsível do Swarm interno

**Motivação**: Hoje `Swarm` só sugere que o modelo use Ruflo. Depois da
Fase 3, a extensão já saberá quais agentes existem e quais times fazem
sentido; falta transformar isso em execução previsível.

**O que entregar**:
1. Ao enviar uma tarefa em `Swarm`, classificar a tarefa
2. Montar um time a partir das regras
3. Mostrar ao usuário o time escolhido antes de executar
4. Orquestrar a abertura dos agentes e o uso das ferramentas Ruflo de forma
   consistente
5. Permitir:
   - aceitar time sugerido
   - editar time
   - rodar em modo automático

**Critérios de pronto**:
- [ ] Swarm deixa de depender só de um prefixo textual
- [ ] Mesma tarefa tende a gerar o mesmo tipo de time
- [ ] Usuário entende quem foi chamado e por quê

### 6.7 Fase 5 — Live view do swarm

**Motivação**: Quando o swarm está executando (vários agentes em
paralelo), hoje o usuário vê uma sequência confusa de tool_use cards
sem distinguir qual agente está fazendo o quê.

**O que entregar**:
1. Detector de "agente ativo" nos eventos do MCP (mensagens tipo
   `agent_spawn` retornam metadata sobre qual agente está respondendo)
2. Agrupamento visual de tool_use cards por agente — cada agente vira
   uma "lane" com cor própria
3. Cabeçalho de cada lane mostra: nome do agente + status + tokens
   consumidos + tempo decorrido
4. Botão "Pausar swarm" / "Cancelar swarm" no header do chat enquanto
   um swarm está ativo
5. Paleta de cores por agente (mantém identidade visual mesmo entre
   sessões):
   - `researcher` → azul
   - `coder` → verde
   - `reviewer` → roxo
   - `tester` → laranja
   - `security-architect` → vermelho
   - `architect` → ciano
   - etc.

**Componentes técnicos**:
- Backend: trackear qual `agent_id` está produzindo cada bloco no
  `handleSdkMessage`. Anexar `agentName` aos messages do session.
- Webview: refator de `renderMessages` para agrupar por `agentName`
- CSS: lanes verticais com cores diferenciadas, header sticky

**Critérios de pronto**:
- [ ] Swarm de 3+ agentes mostra 3+ lanes visualmente distintas
- [ ] Tokens contados por agente
- [ ] Botão pausar swarm funciona (envia control_request adequado)

### 6.8 Fora de escopo (NÃO implementar a menos que pedido)

- ❌ `/plugin install ruflo-core@ruflo` (depende do Claude Code oficial)
- ❌ Hooks de file-edit do Ruflo que monitoram `.claude/` paths (idem)
- ❌ Embedar Ruflo libs em-processo no `extension.js`
- ❌ Web UI do Ruflo dentro da extensão (é app separado)
- ❌ Federation multi-machine (complexo, baixo valor pra uso pessoal)
- ❌ Reescrever toda a UI em React/Vue/etc. (não pediram)

---

## 7. Como o usuário valida

Parte da validação agora tem smoke test automatizado, mas a validação
visual/interativa no Extension Host do VS Code ainda depende do usuário.

Checklist atual depois das 9 rodadas:

- [x] **Tema dinâmico**: troca Dark+/Light+/HC e UI segue
- [x] **Alinhamento bottom**: composer encosta no fundo da sidebar
- [x] **Sem ilhas internas**: toolbar/body/composer flush
- [x] **Histórico não vaza**: safe area no `.home`
- [x] **Notificação delete**: toast nativa do VSCode (não modal)
- [x] **Pill detecta CLI instalada**: mostra versão `3.7.0-alpha.42`
- [x] **Pill detecta MCP ativo com explicação confiável**
- [x] **Pill detecta daemon quando ele está ativo**
- [x] **Chip switcher**: 2 botões funcionam, "Swarm" tem cor sunset quando ativo
- [x] **Console logs**: `[Mode]`, `[PermissionMode]`, `[Thinking]`, `[Ruflo]`
- [x] **Ação Abrir CLI**: menu/tela do Ruflo abrem cmd.exe rodando `claude-flow doctor`

---

## 8. Quando IA assume o projeto — Como começar

1. **Lê este CONTEXT.md** inteiro (você está aqui).
2. **Lê o [CHANGES.md](./CHANGES.md)** pra entender o "por quê" de cada
   linha de código atual.
3. **Lê o [RESEARCH.md](./RESEARCH.md)** pra contexto Ruflo.
4. **Antes de tocar código**:
   - `Grep` no `extension.js` por funções relevantes ao que você vai
     fazer (ex.: `Grep "setSessionMode"`)
   - `Read` o trecho do arquivo (linhas que vai editar)
   - Confirma com o usuário se há ambiguidade
5. **Padrão de edits**:
   - Toda mudança grande tem que entrar no CHANGES.md (nova rodada)
   - Atualizar este CONTEXT.md se o estado mudou estruturalmente
   - Manter `console.log` pré-existentes (são intencionais pra debug)
6. **Comunicação com usuário**:
   - Português brasileiro
   - Direto ao ponto, evita "boilerplate IA"
   - Não invente features que ele não pediu
   - Em dúvida sobre prioridade, **pergunta** antes de implementar

### 8.1 Comandos úteis (cheat sheet)

```cmd
# Ruflo / claude-flow
claude-flow --version          # Confirma instalação global
claude-flow doctor             # Diagnóstico completo do ambiente
claude-flow daemon start       # Sobe daemon (workers de background)
claude-flow daemon status      # Estado do daemon
claude-flow daemon stop        # Para o daemon
claude-flow agent list         # Lista agentes disponíveis
claude-flow mcp start          # Inicia MCP server (stdio)

# OpenClaude
openclaude mcp list            # Lista MCPs registrados (per-project!)
openclaude mcp add claude-flow -- claude-flow mcp start    # Registra
openclaude mcp remove claude-flow                          # Desregistra

# Instalação Ruflo
npm install -g @claude-flow/cli     # Instalação global (evita npx-cache hell)
where claude-flow                   # Confirma path do bin
npm cache clean --force             # Recovery quando cache fica corrompido
```

### 8.2 Pontos críticos do código (mapa de "onde encontro X")

| O que procurar | Arquivo:linha aproximada |
|---|---|
| Constantes Ruflo (`SESSION_MODES`, `RUFLO_PROMPT_PREFIX`) | src/constants.js |
| Helpers compartilhados (`normalizeSessionMode`, parsing, cards) | src/utils.js |
| Stores de profile / skills / histórico | src/stores/*.js |
| Wizards de profiles, skills e agents | src/commands.js |
| HTML do webview | src/webview-html.js |
| `OpenClaudeViewProvider` (classe principal) | src/openclaude-view-provider.js ~32+ |
| `handleWebviewMessage` (handlers de mensagens do webview) | src/openclaude-view-provider.js ~74+ |
| `createSession` (criação de sessão real) | src/openclaude-view-provider.js ~384+ |
| `startSessionRuntime` / `buildRuntimeArtifacts` | src/openclaude-view-provider.js |
| `sendUserMessage` (envio com prefix de Ruflo mode) | src/openclaude-view-provider.js ~604+ |
| `setSessionPermissionMode` / `setSessionThinking` / `setSessionMode` | src/openclaude-view-provider.js ~699-799 |
| Capacidade adaptativa por provider/modelo | src/services/model-capabilities.js |
| Priorização/limite de tools do Ruflo | src/services/ruflo-tool-policy.js |
| `checkRufloEnvironment` (detector) | src/openclaude-view-provider.js ~844+ |
| `openRufloCli` (abre terminal integrado) | src/openclaude-view-provider.js ~924+ |
| `serializeSession` (envia state pro webview) | src/openclaude-view-provider.js ~1674+ |
| `activate` (entry point + registro de comandos) | extension.js ~9+ |
| Refs do webview JS | media/webview.js ~80-110 |
| Listeners de botões | media/webview.js ~1230-1310 |
| `applyRufloStatus` (atualiza pill) | media/webview.js ~1310+ |
| Handler de message do host | media/webview.js ~1380+ |
| Design tokens CSS (`:root`) | media/webview.css ~4-60 |
| `.permission-btn` / `.mode-btn` | media/webview.css ~1490-1570 |
| `.thinking-toggle` / `.commands-button` | media/webview.css ~1570-1640 |
| `.ruflo-status-pill` | media/webview.css ~1810+ |

---

## 9. Decisões arquiteturais (ADRs informais)

### ADR-1: Edits diretos no bundle instalado em `.vscode/extensions/`

**Contexto**: Não existe repositório-fonte separado. A extensão vive só
como instalação local.

**Decisão**: Editar `extension.js`, `webview.css`, `webview.js`
diretamente no diretório de instalação.

**Consequências**:
- + Edits têm efeito imediato após Reload Window
- - Não há controle de versão (mitigado por CHANGES.md)
- - Pode ser sobrescrito ao reinstalar extensão (mitigado por nunca
    reinstalar — é distribuição privada)
- + Usuário planeja migrar pra GitHub eventualmente; CONTEXT.md +
    CHANGES.md facilitam essa migração

### ADR-2: Integração Ruflo via MCP, não embedding

**Decisão**: Usar `@claude-flow/cli` como CLI separada exposta via MCP
server, não embedar bibliotecas do Ruflo em `extension.js`.

**Razão**:
- Ruflo depende de Rust opcional, Docker, MongoDB, 27 hooks
- Embedar = reescrever a extensão
- MCP entrega 90% do valor com 1% do esforço

### ADR-3: Modo × Permission como eixos ortogonais

**Decisão original (Rodada 5)**: Adicionar `session.mode` separado de
`session.permissionMode`, com 3 valores (`default`/`plan`/`ruflo`).

**Refinamento (Rodada 10)**: Colapsar Modo pra 2 valores binários
(`single`/`swarm`) e remover todo pareamento implícito entre os eixos. Era
duplicação: "Modo Plan" era 1:1 com `permissionMode=plan`. Helper
`normalizeSessionMode` converte valores legacy sem quebrar sessões antigas.

**Razão (atual)**:
- Dois eixos estritamente ortogonais — usuário muda um, outro não se move
- Permite todas as combinações úteis: `single+plan`, `swarm+plan`,
  `swarm+bypass`, etc.
- Visualmente: 2 chips + 4 chips = 6 chips claros (vs. 3+4=7 com
  duplicação semântica de Plan)

### ADR-4: Ação "Abrir CLI" abre terminal, não chat dedicado

**Decisão**: Em vez de implementar uma segunda webview pra interagir
com `claude-flow` em modo chat, usar `vscode.window.createTerminal` que
abre o CLI nativo dentro do VSCode.

**Razão**:
- claude-flow não é interativo (é toolkit de subcomandos discretos)
- Tentar fazer wrapper visual = duplicar trabalho que já existe na
  CLI nativa
- Reusa as env vars de provider do profile ativo da extensão

### ADR-5: Probes de detector tolerantes a falha

**Decisão**: `checkRufloEnvironment` nunca throws. Cada probe captura
exceções e deixa o flag correspondente como `false`.

**Razão**:
- Detector roda em hydrate (no boot da webview) — se throwar, quebra
  o boot todo
- Estados `false` são informativos (pill mostra "offline" → usuário
  age)

### ADR-6: Backend modular antes do Ruflo interno

**Decisão**: Extrair constantes, helpers, stores, comandos e HTML para `src/`
antes de implementar o Ruflo interno.

**Razão**:
- reduz o risco de mexer no arquivo principal durante as próximas fases
- deixa claro onde cada responsabilidade mora
- prepara uma futura separação do `OpenClaudeViewProvider` sem precisar
  desmontar tudo em uma única rodada

### ADR-7: Toda refatoração estrutural precisa de smoke test

**Decisão**: manter `npm run smoke` cobrindo os fluxos críticos do backend.

**Razão**:
- `node --check` só pega sintaxe, não imports esquecidos em runtime
- a Rodada 12 provou que hydrate, novo chat e Ruflo CLI podem quebrar mesmo
  com sintaxe válida
- o teste é barato e roda sem precisar abrir um Extension Host real

### ADR-8: `.openclaude` é canônico; `.claude` vira ponte temporária

**Decisão**: a extensão grava e lê seus próprios dados em `.openclaude` /
`.openclaude.json`. Enquanto o `openclaude` instalado ainda exigir alguns
subdiretórios de projeto em `.claude`, a extensão gera um espelho automático
antes de iniciar sessão.

**Razão**:
- evita continuar tratando `.claude` como casa oficial da extensão
- preserva compatibilidade imediata com o CLI 0.8.0 já instalado
- deixa a remoção da ponte futura isolada a um único serviço

---

## 10. Glossário

| Termo | Significado |
|---|---|
| **Open Claude** | A extensão VSCode do usuário (este projeto) |
| **openclaude** | A CLI (`openclaude.cmd`) que a extensão controla via child process |
| **Ruflo** | Marca/produto da ruvnet (https://github.com/ruvnet/ruflo) |
| **claude-flow** | Nome real do pacote npm e do binário do Ruflo (`@claude-flow/cli`) |
| **MCP** | Model Context Protocol — padrão pra LLMs chamarem ferramentas externas via JSON-RPC stdio |
| **Daemon** | Processo de background do Ruflo que roda workers (audit, optimize, etc.) sem intervenção do LLM |
| **Mode** | Eixo de configuração de sessão = QUEM responde (`single`/`swarm` desde Rodada 10; valores antigos `default`/`plan`/`ruflo` ainda aceitos via `normalizeSessionMode`) |
| **Permission Mode** | Eixo ortogonal = COMO o agente age (default/acceptEdits/plan/bypassPermissions) |
| **Pill** | O botão de status no toolbar mostrando estado do Ruflo |
| **Chip switcher** | Grupo de botões redondos pra alternar entre modos (UI pattern) |
| **Safe area** | Padding extra no bottom de áreas roláveis pra evitar conteúdo deslizar atrás do canto arredondado da custom UI |
| **Custom UI** | Refere-se a temas/extensões que arredondam painéis (Apc Customize, Island Dark) |
| **Sunset palette** | Cores `--oc-sun-*` no CSS (laranjas/marrons) = identidade visual da extensão |

---

**Fim do CONTEXT.md.** Próxima ação esperada: iniciar a Fase 3 para
catalogar os agentes reais do Ruflo e definir as regras de composição dos
times do Swarm interno.

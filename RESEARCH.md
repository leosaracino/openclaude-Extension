# Pesquisa — Integração Ruflo × Extensão Open Claude

**Data:** 2026-05-14
**Pergunta-guia:** É possível integrar o Ruflo (https://github.com/ruvnet/ruflo) dentro
da extensão Open Claude no VSCode, utilizando LLMs diferentes? É possível aplicar toda
a funcionalidade do Ruflo diretamente nessa extensão?

---

## 1. O que é o Ruflo

Plataforma de orquestração de agentes para Claude (e LLMs alternativos). Posiciona-se
como um "sistema nervoso" sobre o Claude Code: agentes que se auto-organizam,
aprendem com tarefas, têm memória persistente e colaboram via federação.

**Capacidades principais:**
- Roteador + swarm coordination com 100+ agentes especializados
- AgentDB: memória vetorial indexada por HNSW (search 150×–12.500× mais rápida)
- SONA: neural pattern learning + trajetória
- ReasoningBank: recuperação de soluções passadas
- 12 background workers automáticos (audit, optimize, testgaps, map, document…)
- Federation layer com mTLS + PII stripping para colaboração entre máquinas
- MCP Server com ~210 ferramentas em 5 grupos (Core, Intelligence, Agents, Memory, DevTools)

**Licença:** MIT — uso, modificação e redistribuição livres com atribuição.

---

## 2. Arquitetura e dependências do Ruflo

**Stack:**
- TypeScript (88%) + JavaScript (5%) + Shell (3,6%) + Svelte (1,7%) + Rust (0,6%)
- Runtime: **Node.js obrigatório**; Rust opcional (backend Cognitum.One); Docker opcional (Web UI + MongoDB embutido)
- Ollama-compatível para LLMs locais

**Pacotes / entry points relevantes:**
- CLI: `npx ruflo@latest` → comandos `init`, `init wizard`, `mcp start`, `federation init/join`, `verify`
- MCP: `claude mcp add ruflo -- npx ruflo@latest mcp start`
- Plugin Claude Code: `/plugin install ruflo-core@ruflo`
- npm: `@claude-flow/plugin-*` (32 plugins), `@claude-flow/plugin-agent-federation`, `ruvector`, `neural-trader`

**Suporte multi-LLM:**
- Nativo: **Anthropic Claude** (primário)
- Multi-provider: GPT, Gemini, Cohere, Ollama com smart routing + failover
- ruvLLM: camada local self-improving com adapters MicroLoRA
- UI web: 6 modelos curados via OpenRouter (Qwen 3.6 Max default, variantes Claude, Gemini, OpenAI)

---

## 3. Arquitetura da extensão Open Claude

**Estrutura (instalada em `~/.vscode/extensions/leonardo.openclaude-tools-0.0.1`):**
- `package.json` — manifesto VSCode (publisher `leonardo`, viewType `webview`)
- `extension.js` — backend Node (3.517 linhas), wrapper sobre o CLI `openclaude.cmd`
  localizado em `<npm-global-bin-dir>/openclaude.cmd`
- `media/webview.css` — UI (1.765 linhas, já usa variáveis `--vscode-*` em design tokens)
- `media/webview.js` — front-end do webview (1.357 linhas)
- `media/openclaude.svg` — ícone

**Multi-LLM já presente** — `extension.js` define `PROVIDER_KEYS` com env vars para
Anthropic, OpenAI, GitHub Models, Gemini, Mistral, Bedrock, Vertex, Foundry, Codex, xAI.

**Slash commands existentes** já incluem `/agents`, `/mcp`, `/hooks`, `/model`,
`/provider` — ou seja, a CLI subjacente (`openclaude`) parece ser um fork/derivado do
Claude Code que **já suporta o ecossistema MCP e plugins**.

---

## 4. Compatibilidade — caminhos de integração

### Opção A — Ruflo como MCP Server *(recomendada, atrito mínimo)*

A CLI `openclaude` aparenta suportar MCP (slash `/mcp` listado). O usuário pode
registrar o Ruflo MCP server:

```bash
# Exemplo — usar com o binário openclaude
openclaude mcp add ruflo -- npx ruflo@latest mcp start
```

- ✅ **Não exige alterações no código** da extensão
- ✅ Funciona com qualquer LLM já configurado na extensão (Anthropic, OpenAI, etc.)
- ✅ Disponibiliza as ~210 ferramentas do Ruflo dentro de qualquer sessão de chat
- ⚠️ A integração com a UI da extensão fica limitada ao chat — não há painéis dedicados

### Opção B — Ruflo como plugin Claude Code

```bash
openclaude /plugin install ruflo-core@ruflo
```

- ✅ Adiciona slash commands + definições de agente
- ⚠️ Só funciona se a CLI `openclaude` implementar o sistema de plugins do Claude Code (a inspecionar)
- ⚠️ É a versão "lite" do Ruflo — sem swarm coordination completa

### Opção C — Bundle do CLI Ruflo ao lado do CLI Open Claude

A extensão poderia oferecer um comando ("Install Ruflo Tools") que executa
`npm install -g ruflo` e expõe um modo Ruflo separado no webview.

- ✅ Dá acesso completo ao Ruflo (CLI + agentes + federation)
- ⚠️ Duplica processos: usuário escolhe entre rodar `openclaude` ou `ruflo`
- ⚠️ Aumenta complexidade da UI (dois modelos mentais de chat)

### Opção D — Embutir o Ruflo dentro do `extension.js`

Reescrever a extensão para chamar bibliotecas do Ruflo (`ruvector`, AgentDB, swarm) em
processo, sem CLI separada.

- ❌ Inviável para "toda a funcionalidade": Ruflo depende de Rust backend opcional,
  Docker (Web UI), federation com mTLS, 27 hooks + 12 workers de background,
  100+ agentes — embutir tudo é reescrever a extensão.
- ✅ Possível para partes isoladas (ex.: usar `ruvector` como lib para histórico
  semântico de sessões)

---

## 5. Multi-LLM dentro da extensão integrada com Ruflo

A extensão **já é multi-LLM** via env vars (`ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`,
`MISTRAL_*`, `XAI_*`, Bedrock/Vertex/Foundry). Adicionar Ruflo:

- Pelo caminho MCP (Opção A), Ruflo herda o LLM ativo na sessão — qualquer provider
  configurado funciona.
- Pelo caminho CLI direto (Opção C), Ruflo tem seu próprio smart-routing entre Claude,
  GPT, Gemini, Cohere, Ollama — controlado por `ruflo config` ou via UI web em
  `flo.ruv.io`.

---

## 6. Veredito e recomendação

| Pergunta | Resposta |
|---|---|
| É possível integrar Ruflo? | **Sim**, principalmente via MCP server (Opção A). |
| Com LLMs diferentes? | **Sim** — ambos os lados são multi-provider. |
| **Toda** a funcionalidade do Ruflo dentro da extensão? | **Não** — embutir 100% (Opção D) implica reescrever a extensão. Mas via Opção A o usuário acessa as ~210 ferramentas MCP do Ruflo sem mudar a extensão. |

**Recomendação prática:**
1. **Curto prazo:** documentar no README como adicionar Ruflo como MCP server na CLI
   `openclaude`. Zero alteração de código.
2. **Médio prazo:** adicionar um comando interno na extensão
   (`leonardo.openClaude.installRuflo`) que executa o `mcp add` automaticamente e
   um painel de status mostrando os agentes Ruflo ativos.
3. **Longo prazo:** considerar usar `ruvector` (lib MIT) para indexar o histórico
   semântico das sessões — feature isolada, alto valor, baixo custo.

**Não recomendado:** tentar embutir o stack completo do Ruflo dentro do bundle
`extension.js`. Custo de manutenção e dependências runtime (Rust, Docker, MongoDB)
inviabilizam.

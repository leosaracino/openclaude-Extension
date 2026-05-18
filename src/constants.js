const fs = require('fs');
const path = require('path');

function resolveOpenClaudeCommand() {
  if (process.env.OPENCLAUDE_CMD) {
    return process.env.OPENCLAUDE_CMD;
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    const npmGlobalCommand = path.join(process.env.APPDATA, 'npm', 'openclaude.cmd');
    if (fs.existsSync(npmGlobalCommand)) {
      return npmGlobalCommand;
    }
  }

  return 'openclaude';
}

const OPENCLAUDE_CMD = resolveOpenClaudeCommand();
const PROFILES_KEY = 'leonardo.openclaude.profiles';
const ACTIVE_PROFILE_KEY = 'leonardo.openclaude.activeProfileId';

// Cap on how many sessions appear in the history list - combined across
// OpenClaude current/legacy stores and Codex stores. The list is sorted by updatedAt
// descending so the most recently touched sessions always appear first.
const MAX_HISTORY_ITEMS = 30;
const MAX_HISTORY_FILE_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_PREVIEW = 280;

const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
const DEFAULT_PERMISSION_MODE = 'acceptEdits';
// Token budget the SDK accepts via set_max_thinking_tokens. 0 disables thinking,
// null restores default. We use a generous-but-bounded budget when enabled.
const THINKING_TOKEN_BUDGET = 10000;

// Operation mode = WHO answers the chat. Strictly orthogonal to
// permissionMode (which controls HOW the responder is allowed to act).
//   single -> one LLM responds (the active profile)
//   swarm  -> user prompt is prefixed so the LLM is encouraged to reach for
//             Ruflo MCP tools (swarm_init, agent_spawn, memory_search, ...)
//
// "Plan" used to be a third mode but it duplicated permissionMode='plan'
// 1:1 - collapsed away. To get planning behavior now, leave the mode on
// "single" and pick permissionMode='plan'. Same outcome, no redundancy.
const SESSION_MODES = ['single', 'swarm'];
const DEFAULT_SESSION_MODE = 'single';

// Short prefix prepended to user messages while in Swarm mode. NOT shown in
// the transcript UI - instruction wrapper sent only to the model so it
// reaches for the Ruflo MCP swarm when the task benefits.
const RUFLO_PROMPT_PREFIX =
  '[Modo Swarm ativo — use as MCP tools do Ruflo (swarm_init, agent_spawn, memory_search, memory_store, hooks_route) quando a tarefa puder ser melhor resolvida com agentes especializados em paralelo.]\n\n';

const PROVIDER_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_MISTRAL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED',
  'CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_CUSTOM_HEADERS',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_MODEL',
  'OPENAI_API_FORMAT',
  'OPENAI_AUTH_HEADER',
  'OPENAI_AUTH_SCHEME',
  'OPENAI_AUTH_HEADER_VALUE',
  'OPENAI_API_KEY',
  'CLAUDE_CODE_OPENAI_CONTEXT_WINDOWS',
  'CLAUDE_CODE_OPENAI_MAX_OUTPUT_TOKENS',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'CODEX_API_KEY',
  'CODEX_CREDENTIAL_SOURCE',
  'CHATGPT_ACCOUNT_ID',
  'CODEX_ACCOUNT_ID',
  'GEMINI_API_KEY',
  'GEMINI_AUTH_MODE',
  'GEMINI_ACCESS_TOKEN',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'GOOGLE_API_KEY',
  'MISTRAL_BASE_URL',
  'MISTRAL_API_KEY',
  'MISTRAL_MODEL',
  'XAI_API_KEY'
];

module.exports = {
  resolveOpenClaudeCommand,
  OPENCLAUDE_CMD,
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_FILE_BYTES,
  MAX_MESSAGE_PREVIEW,
  PERMISSION_MODES,
  DEFAULT_PERMISSION_MODE,
  THINKING_TOKEN_BUDGET,
  SESSION_MODES,
  DEFAULT_SESSION_MODE,
  RUFLO_PROMPT_PREFIX,
  PROVIDER_KEYS
};

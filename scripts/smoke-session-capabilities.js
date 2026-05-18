const assert = require('assert');

const { resolveModelCapabilities } = require('../src/services/model-capabilities');
const {
  selectRufloTools,
  buildRufloDenyRules
} = require('../src/services/ruflo-tool-policy');

function run() {
  const groq = resolveModelCapabilities({
    provider: 'openai-compatible',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    baseUrl: 'https://api.groq.com/openai/v1'
  });
  assert.strictEqual(groq.providerId, 'groq');
  assert.strictEqual(groq.maxTotalTools, 128);
  assert.strictEqual(groq.maxMcpTools, 80);
  assert.strictEqual(groq.contextWindow, 131072);
  assert.strictEqual(groq.maxOutputTokens, 8192);

  const stronger = resolveModelCapabilities({
    provider: 'anthropic',
    model: 'claude-opus-example'
  });
  assert.strictEqual(stronger.maxTotalTools, 256);
  assert.strictEqual(stronger.maxMcpTools, 208);

  const catalog = Array.from({ length: 120 }, (_, index) => ({
    name: index === 0 ? 'swarm_init' : `tool_${index}`,
    category: index === 0 ? 'swarm' : 'workflow',
    enabled: true
  }));
  const selection = selectRufloTools(catalog, groq.maxMcpTools);
  assert.strictEqual(selection.selectedNames.length, 80);
  assert(selection.selectedNames.includes('swarm_init'));
  assert.strictEqual(selection.deniedNames.length, 40);
  assert.strictEqual(buildRufloDenyRules(selection.deniedNames)[0].startsWith('mcp__claude-flow__'), true);

  console.log('session capabilities smoke passed');
}

run();

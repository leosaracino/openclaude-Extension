const CORE_TOOL_NAMES = [
  'guidance_recommend',
  'guidance_workflow',
  'guidance_capabilities',
  'guidance_discover',
  'guidance_quickref',
  'hooks_route',
  'swarm_init',
  'swarm_status',
  'swarm_health',
  'swarm_shutdown',
  'agent_spawn',
  'agent_execute',
  'agent_list',
  'agent_status',
  'agent_health',
  'agent_logs',
  'agent_terminate',
  'memory_search',
  'memory_search_unified',
  'memory_store',
  'memory_retrieve',
  'memory_list',
  'memory_stats',
  'memory_delete'
];

const CATEGORY_PRIORITY = [
  'agent',
  'swarm',
  'memory',
  'hooks',
  'task',
  'coordination',
  'workflow',
  'analyze',
  'performance',
  'github',
  'security',
  'session',
  'system',
  'config',
  'claims',
  'transfer',
  'embeddings',
  'neural',
  'autopilot',
  'hive-mind',
  'browser-session',
  'terminal',
  'uncategorized'
];

function normalizeToolCatalog(catalog) {
  return Array.isArray(catalog)
    ? catalog
        .filter((tool) => tool && typeof tool.name === 'string' && tool.name.trim())
        .map((tool) => ({
          name: tool.name.trim(),
          category: String(tool.category || 'uncategorized').trim() || 'uncategorized',
          description: String(tool.description || ''),
          enabled: tool.enabled !== false
        }))
        .filter((tool) => tool.enabled)
    : [];
}

function sortByPriority(catalog) {
  const coreRank = new Map(CORE_TOOL_NAMES.map((name, index) => [name, index]));
  const categoryRank = new Map(CATEGORY_PRIORITY.map((name, index) => [name, index]));

  return normalizeToolCatalog(catalog).sort((a, b) => {
    const aCore = coreRank.has(a.name) ? coreRank.get(a.name) : Number.MAX_SAFE_INTEGER;
    const bCore = coreRank.has(b.name) ? coreRank.get(b.name) : Number.MAX_SAFE_INTEGER;
    if (aCore !== bCore) {
      return aCore - bCore;
    }

    const aCategory = categoryRank.has(a.category)
      ? categoryRank.get(a.category)
      : Number.MAX_SAFE_INTEGER;
    const bCategory = categoryRank.has(b.category)
      ? categoryRank.get(b.category)
      : Number.MAX_SAFE_INTEGER;
    if (aCategory !== bCategory) {
      return aCategory - bCategory;
    }

    return a.name.localeCompare(b.name);
  });
}

function selectRufloTools(catalog, maxTools) {
  const ordered = sortByPriority(catalog);
  const budget = Number.isFinite(maxTools) && maxTools >= 0
    ? Math.floor(maxTools)
    : ordered.length;
  const selected = ordered.slice(0, budget);

  let tier = 'full';
  if (selected.length < ordered.length) {
    const selectedNames = new Set(selected.map((tool) => tool.name));
    tier = CORE_TOOL_NAMES.every((name) => !ordered.some((tool) => tool.name === name) || selectedNames.has(name))
      ? 'adaptive'
      : 'minimal';
  }

  return {
    tier,
    totalAvailable: ordered.length,
    selected,
    selectedNames: selected.map((tool) => tool.name),
    deniedNames: ordered.slice(selected.length).map((tool) => tool.name)
  };
}

function buildRufloDenyRules(toolNames, serverName = 'claude-flow') {
  return (Array.isArray(toolNames) ? toolNames : []).map(
    (toolName) => `mcp__${serverName}__${toolName}`
  );
}

module.exports = {
  CORE_TOOL_NAMES,
  CATEGORY_PRIORITY,
  normalizeToolCatalog,
  sortByPriority,
  selectRufloTools,
  buildRufloDenyRules
};

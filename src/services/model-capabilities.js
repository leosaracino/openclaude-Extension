const DEFAULT_TOTAL_TOOL_LIMIT = 128;
const DEFAULT_BUILT_IN_TOOL_RESERVE = 48;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function hostOf(baseUrl) {
  try {
    return new URL(baseUrl || '').hostname.toLowerCase();
  } catch {
    return '';
  }
}

// Some providers publish hard request-level tool ceilings, while others only
// vary by model family. Keep the resolver layered so model-specific metadata
// can override provider defaults as we add more exact entries over time.
const MODEL_OVERRIDES = [
  {
    test: ({ model }) => model === 'meta-llama/llama-4-scout-17b-16e-instruct',
    values: {
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsParallelTools: true
    }
  }
];

const PROVIDER_OVERRIDES = [
  {
    test: ({ host }) => host === 'api.groq.com',
    values: {
      providerId: 'groq',
      providerLabel: 'Groq',
      maxTotalTools: 128,
      supportsParallelTools: true
    }
  },
  {
    test: ({ provider, host }) => provider === 'gemini' || host === 'generativelanguage.googleapis.com',
    values: {
      providerId: 'gemini',
      providerLabel: 'Google Gemini',
      maxTotalTools: 128
    }
  },
  {
    test: ({ provider }) => provider === 'ollama',
    values: {
      providerId: 'ollama',
      providerLabel: 'Ollama',
      maxTotalTools: 96
    }
  },
  {
    test: ({ provider }) => provider === 'anthropic',
    values: {
      providerId: 'anthropic',
      providerLabel: 'Anthropic',
      maxTotalTools: 256,
      supportsParallelTools: true
    }
  }
];

function resolveModelCapabilities(profile = {}) {
  const provider = lower(profile.provider);
  const model = lower(profile.model);
  const host = hostOf(profile.baseUrl);
  const context = { provider, model, host };

  const resolved = {
    providerId: provider || 'generic',
    providerLabel: profile.provider || 'Generic',
    model: profile.model || '',
    maxTotalTools: DEFAULT_TOTAL_TOOL_LIMIT,
    builtInToolReserve: DEFAULT_BUILT_IN_TOOL_RESERVE,
    supportsParallelTools: false,
    contextWindow: undefined,
    maxOutputTokens: undefined,
    source: 'fallback'
  };

  for (const entry of PROVIDER_OVERRIDES) {
    if (entry.test(context)) {
      Object.assign(resolved, entry.values, { source: 'provider' });
      break;
    }
  }

  for (const entry of MODEL_OVERRIDES) {
    if (entry.test(context)) {
      Object.assign(resolved, entry.values, {
        source: resolved.source === 'fallback' ? 'model' : `${resolved.source}+model`
      });
      break;
    }
  }

  const explicitLimit = toNumber(profile.maxTools || profile.toolLimit || profile.maxTotalTools);
  if (explicitLimit) {
    resolved.maxTotalTools = explicitLimit;
    resolved.source = `${resolved.source}+profile`;
  }

  const explicitReserve = toNumber(profile.builtInToolReserve);
  if (explicitReserve) {
    resolved.builtInToolReserve = explicitReserve;
  }

  const explicitContextWindow = toNumber(profile.contextWindow);
  if (explicitContextWindow) {
    resolved.contextWindow = explicitContextWindow;
    resolved.source = `${resolved.source}+profile`;
  }

  const explicitMaxOutputTokens = toNumber(
    profile.maxOutputTokens || profile.outputTokenLimit || profile.maxCompletionTokens
  );
  if (explicitMaxOutputTokens) {
    resolved.maxOutputTokens = explicitMaxOutputTokens;
    resolved.source = `${resolved.source}+profile`;
  }

  resolved.maxMcpTools = Math.max(0, resolved.maxTotalTools - resolved.builtInToolReserve);
  return resolved;
}

module.exports = {
  DEFAULT_TOTAL_TOOL_LIMIT,
  DEFAULT_BUILT_IN_TOOL_RESERVE,
  resolveModelCapabilities
};

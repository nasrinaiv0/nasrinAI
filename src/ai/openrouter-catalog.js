// OpenRouter skill catalog. Provider/model identity is tracked separately from runtime integration readiness.
// integrationStatus describes NasrinAI integration separately; catalog verification alone
// never makes a model usable for an unsupported endpoint or payload shape.
export const OPENROUTER_SKILL_CATALOG = Object.freeze([
  { name: 'NVIDIA Nemotron 3.5 Lightning (free)', id: 'nvidia/nemotron-3.5-lightning:free', status: 'verified', integrationStatus: 'chat-route', skills: ['fast_chat','coding','reasoning','agent_workflows'], preferredTasks: ['chat','coding','debugging','research'] },
  { name: 'NVIDIA Nemotron 3 Super (free)', id: 'nvidia/nemotron-3-super-120b-a12b:free', status: 'verified', integrationStatus: 'chat-route', skills: ['chat','reasoning','coding','agent_workflows'], preferredTasks: ['chat','analysis','coding','research'] },
  { name: 'NVIDIA Nemotron 3 Ultra (free)', id: 'nvidia/nemotron-3-ultra-550b-a55b:free', status: 'verified', integrationStatus: 'chat-route', skills: ['deep_reasoning','planning','agent_workflows'], preferredTasks: ['analysis','planning','coding','research'] },
  { name: 'DeepSeek V4.1 Flash', id: 'deepseek/deepseek-v4.1-flash', status: 'verified', integrationStatus: 'chat-route', skills: ['chat','coding','debugging','research','analysis','agent_workflows','vision'], preferredTasks: ['chat','coding','debugging','research','analysis'] },
  { name: 'GLM 5.3 Flash', id: 'z-ai/glm-5.3-flash', status: 'verified', integrationStatus: 'chat-route', skills: ['fast_chat','coding','multimodal_understanding','agent_workflows'], preferredTasks: ['chat','coding','debugging','research'] },
  { name: 'MiMo-V2.6-Flash', id: 'xiaomi/mimo-v2.6-flash', status: 'verified', integrationStatus: 'chat-route', skills: ['chat','coding','research','vision','agent_workflows'], preferredTasks: ['chat','coding','research','analysis'] },
  { name: 'DeepSeek V4.1 Flash 1017', id: 'deepseek/deepseek-v4.1-flash-1017', status: 'verified', integrationStatus: 'chat-route', skills: ['chat','coding','debugging','research','analysis','agent_workflows','vision'], preferredTasks: ['chat','coding','debugging','research','analysis'] },
  { name: 'DeepSeek V4 Flash 0731', id: 'deepseek/deepseek-v4-flash-0731', status: 'verified', integrationStatus: 'chat-route', skills: ['coding','reasoning','agent_workflows'], preferredTasks: ['coding','debugging','analysis'] },
  { name: 'DeepSeek V4 Flash Vision Exp (legacy alias)', id: 'deepseek/deepseek-v4-flash-vision-exp', status: 'verified', integrationStatus: 'chat-route', skills: ['image_understanding','chart_analysis','document_understanding','vision','agent_workflows'], preferredTasks: ['vision','pdf','research','analysis'] },
  { name: 'Jev1.13', id: 'typesafe/jev-1.13', status: 'verified', integrationStatus: 'decisions-api-required', skills: ['brainstorming','decision_support'], preferredTasks: ['planning','analysis','decision'] },
  { name: 'GPT-6 Luna', id: 'openai/gpt-6-luna', status: 'verified', integrationStatus: 'chat-route', skills: ['fast_chat','classification','tool_calling','coding'], preferredTasks: ['chat','coding','research'] },
  { name: 'GPT-6 Luna Pro', id: 'openai/gpt-6-luna-pro', status: 'verified', integrationStatus: 'chat-route', skills: ['deep_reasoning','complex_analysis'], preferredTasks: ['analysis','design','coding'] },
  { name: 'GPT-6 Luna Decisions', id: 'openai/gpt-6-luna-decisions', status: 'verified', integrationStatus: 'decisions-api-required', skills: ['structured_decisions','classification','routing','scoring'], preferredTasks: ['decision','decisions'] },
  { name: 'Claude Haiku 5.5', id: 'anthropic/claude-haiku-5.5', status: 'verified', integrationStatus: 'chat-route', skills: ['writing','summarization','coding_assistance','agent_tasks'], preferredTasks: ['writing','chat','coding','research'] },
  { name: 'MiMo-V2.6-Pro', id: 'xiaomi/mimo-v2.6-pro', status: 'verified', integrationStatus: 'chat-route', skills: ['advanced_reasoning','complex_coding','research','vision','agent_workflows'], preferredTasks: ['analysis','coding','research','design'] },
  { name: 'Qwen3.8 Flash', id: 'qwen/qwen3.8-flash', status: 'verified', integrationStatus: 'chat-route', skills: ['reasoning','coding','document_analysis','multimodal','vision','agent_workflows'], preferredTasks: ['coding','research','analysis','design'] },
  { name: 'Qwen3.8 27B', id: 'qwen/qwen3.8-27b', status: 'verified', integrationStatus: 'chat-route', skills: ['vision_language','coding','research','agents'], preferredTasks: ['vision','coding','research'] },
  { name: 'Ling 3.1 Flash', id: 'inclusionai/ling-3.1-flash', status: 'verified', integrationStatus: 'chat-route', skills: ['fast_reasoning','coding','tool_enabled_agents'], preferredTasks: ['coding','chat','research','analysis'] },
  { name: 'Decider V1.2', id: 'perplexity/pplx-decider-v1.2', status: 'verified', integrationStatus: 'decisions-api-required', skills: ['decision_selection','rubric_scoring','moderation'], preferredTasks: ['decision','decisions'] },
  { name: 'Google Vertex Global', id: 'google-vertex/global', status: 'provider-alias', integrationStatus: 'provider-alias-not-chat-model', skills: ['general_generation'], preferredTasks: [] }
]);

const byId = new Map(OPENROUTER_SKILL_CATALOG
  .filter((model) => model.id && model.status === 'verified' && model.integrationStatus === 'chat-route')
  .map((model) => [model.id, model]));

// The deterministic classifier uses product-facing task names, while model
// metadata may use narrower capability labels. Aliases only affect ordering;
// they never add a model, bypass allowlists, or change authorization.
const TASK_ALIASES = Object.freeze({
  decision: ['decision', 'decisions', 'analysis'],
  planning: ['planning', 'analysis', 'research', 'chat'],
  data_analysis: ['data_analysis', 'analysis', 'research'],
  design: ['design', 'analysis'],
  creative: ['creative', 'design', 'chat'],
  writing: ['writing'],
  translate: ['translate', 'writing', 'chat'],
  debugging: ['debugging', 'coding'],
  extraction: ['extraction', 'research', 'analysis']
});

export function prioritizeOpenRouterCandidates(task, candidates) {
  const taskNames = TASK_ALIASES[task] || [task];
  const matching = [];
  const remaining = [];
  const nonOpenRouter = [];

  candidates.forEach((candidate, index) => {
    if (candidate.provider !== 'openrouter') {
      nonOpenRouter.push({ candidate, index });
      return;
    }
    const item = byId.get(candidate.model);
    const ranks = item
      ? taskNames.map((name) => item.preferredTasks.indexOf(name)).filter((rank) => rank >= 0)
      : [];
    if (ranks.length) matching.push({ candidate, rank: Math.min(...ranks), index });
    else remaining.push({ candidate, index });
  });

  matching.sort((a, b) => a.rank - b.rank || a.index - b.index);
  remaining.sort((a, b) => a.index - b.index);
  nonOpenRouter.sort((a, b) => a.index - b.index);
  return [...matching, ...remaining, ...nonOpenRouter].map(({ candidate }) => candidate);
}

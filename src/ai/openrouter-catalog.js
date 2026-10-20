// OpenRouter skill catalog. This is metadata, not an authorization list.
// Only verified exact IDs with prices may be selected by runtime routing; candidates
// must still be explicitly configured in ROUTE_LEVEL_n and pass live capabilities,
// privacy, budget and plan checks in policy.js.
export const OPENROUTER_SKILL_CATALOG = Object.freeze([
  { name: 'DeepSeek V4.1 Flash', id: 'deepseek/deepseek-v4.1-flash', status: 'verified', skills: ['chat','coding','debugging','research','analysis','agent_workflows','vision'], preferredTasks: ['chat','coding','debugging','research','analysis'] },
  { name: 'GLM 5.3 Flash', id: 'z-ai/glm-5.3-flash', status: 'verified', skills: ['fast_chat','coding','multimodal_understanding','agent_workflows'], preferredTasks: ['chat','coding','debugging','research'] },
  { name: 'MiMo-V2.6-Flash', id: 'xiaomi/mimo-v2.6-flash', status: 'verified', skills: ['chat','coding','research','vision','agent_workflows'], preferredTasks: ['chat','coding','research','analysis'] },
  { name: 'DeepSeek V4.1 Flash 1017', id: 'deepseek/deepseek-v4.1-flash-1017', status: 'verified', skills: ['chat','coding','debugging','research','analysis','agent_workflows','vision'], preferredTasks: ['chat','coding','debugging','research','analysis'] },
  { name: 'DeepSeek V4 Flash 0731', id: 'deepseek/deepseek-v4-flash-0731', status: 'verified', skills: ['coding','reasoning','agent_workflows'], preferredTasks: ['coding','debugging','analysis'] },
  { name: 'DeepSeek V4 Flash Vision Exp', id: 'deepseek/deepseek-v4-flash-vision-exp', status: 'verified', skills: ['image_understanding','chart_analysis','document_understanding','vision','agent_workflows'], preferredTasks: ['vision','pdf','research','analysis'] },
  { name: 'Jev1.13', id: 'typesafe/jev-1.13', status: 'operator_supplied_unverified', skills: ['brainstorming','decision_support'], preferredTasks: ['planning','analysis','decision'] },
  { name: 'GPT-6 Luna', id: 'openai/gpt-6-luna', status: 'verified', skills: ['fast_chat','classification','tool_calling','coding'], preferredTasks: ['chat','coding','research'] },
  { name: 'GPT-6 Luna Pro', id: 'openai/gpt-6-luna-pro', status: 'verified', skills: ['deep_reasoning','complex_analysis'], preferredTasks: ['analysis','design','coding'] },
  { name: 'GPT-6 Luna Decisions', id: 'openai/gpt-6-luna-decisions', status: 'operator_supplied_unverified', skills: ['structured_decisions','classification','routing','scoring'], preferredTasks: ['decision','decisions'] },
  { name: 'Claude Haiku 5.5', id: 'anthropic/claude-haiku-5.5', status: 'verified', skills: ['writing','summarization','coding_assistance','agent_tasks'], preferredTasks: ['writing','chat','coding','research'] },
  { name: 'MiMo-V2.6-Pro', id: 'xiaomi/mimo-v2.6-pro', status: 'verified', skills: ['advanced_reasoning','complex_coding','research','vision','agent_workflows'], preferredTasks: ['analysis','coding','research','design'] },
  { name: 'Qwen3.8 Flash', id: 'qwen/qwen3.8-flash', status: 'verified', skills: ['reasoning','coding','document_analysis','multimodal','vision','agent_workflows'], preferredTasks: ['coding','research','analysis','design'] },
  { name: 'Qwen3.8 27B', id: 'qwen/qwen3.8-27b', status: 'operator_supplied_unverified', skills: ['vision_language','coding','research','agents'], preferredTasks: ['vision','coding','research'] },
  { name: 'Ling 3.1 Flash', id: 'inclusionai/ling-3.1-flash', status: 'verified', skills: ['fast_reasoning','coding','tool_enabled_agents'], preferredTasks: ['coding','chat','research','analysis'] },
  { name: 'Decider V1.2', id: 'perplexity/pplx-decider-v1.2', status: 'operator_supplied_unverified', skills: ['decision_selection','rubric_scoring','moderation'], preferredTasks: ['decision','decisions'] },
  { name: 'Google Vertex Global', id: 'google-vertex/global', status: 'operator_supplied_unverified', skills: ['general_generation'], preferredTasks: ['chat','planning'] }
]);

const byId = new Map(OPENROUTER_SKILL_CATALOG.filter((m) => m.id && m.status === 'verified').map((m) => [m.id, m]));
export function prioritizeOpenRouterCandidates(task, candidates) {
  const positions = [];
  const ranked = [];
  candidates.forEach((candidate, index) => {
    if (candidate.provider !== 'openrouter') return;
    const item = byId.get(candidate.model);
    const rank = item ? item.preferredTasks.indexOf(task) : -1;
    if (rank >= 0) {
      positions.push(index);
      ranked.push({ candidate, rank, index });
    }
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  const output = [...candidates];
  positions.forEach((position, i) => { output[position] = ranked[i].candidate; });
  return output;
}

// OpenRouter skill catalog. This is metadata, not an authorization list.
// Only verified exact IDs with prices may be selected by runtime routing; candidates
// must still be explicitly configured in ROUTE_LEVEL_n and pass live capabilities,
// privacy, budget and plan checks in policy.js.
export const OPENROUTER_SKILL_CATALOG = Object.freeze([
  { name: 'DeepSeek V4.1 Flash', id: 'deepseek/deepseek-v4.1-flash', status: 'verified', skills: ['chat','coding','debugging','research','analysis','agent_workflows','vision'], preferredTasks: ['chat','coding','debugging','research','analysis'] },
  { name: 'GLM 5.3 Flash', id: 'z-ai/glm-5.3-flash', status: 'verified', skills: ['fast_chat','coding','multimodal_understanding','agent_workflows'], preferredTasks: ['chat','coding','debugging','research'] },
  { name: 'MiMo-V2.6-Flash', id: 'xiaomi/mimo-v2.6-flash', status: 'verified', skills: ['chat','coding','research','vision','agent_workflows'], preferredTasks: ['chat','coding','research','analysis'] },
  { name: 'DeepSeek V4.1 Flash 1017', id: 'deepseek/deepseek-v4.1-flash-1017', status: 'verified_id_price_pending', skills: ['coding','debugging','research','agent_workflows','vision'], preferredTasks: ['coding','debugging','research'] },
  { name: 'DeepSeek V4 Flash 0731', id: 'deepseek/deepseek-v4-flash-0731', status: 'verified', skills: ['coding','reasoning','agent_workflows'], preferredTasks: ['coding','debugging','analysis'] },
  { name: 'DeepSeek V4 Flash Vision Exp', id: 'deepseek/deepseek-v4-flash-vision-exp', status: 'verified', skills: ['image_understanding','chart_analysis','document_understanding','vision','agent_workflows'], preferredTasks: ['vision','pdf','research','analysis'] },
  { name: 'Jev1.13', id: null, status: 'unverified', skills: [], preferredTasks: [] },
  { name: 'GPT-6 Luna', id: null, status: 'unverified_exact_id', skills: ['fast_chat','classification','tool_calling','coding'], preferredTasks: ['chat','coding'] },
  { name: 'GPT-6 Luna Pro', id: null, status: 'unverified_exact_id', skills: ['deep_reasoning','complex_analysis'], preferredTasks: ['analysis','design','coding'] },
  { name: 'GPT-6 Luna Decisions', id: null, status: 'unverified_exact_id', skills: ['structured_decisions','classification','routing','scoring'], preferredTasks: ['decision','decisions'] },
  { name: 'Claude Haiku 5.5', id: null, status: 'unverified_exact_id', skills: ['writing','summarization','coding_assistance','agent_tasks'], preferredTasks: ['writing','chat','coding'] },
  { name: 'MiMo-V2.6-Pro', id: null, status: 'unverified_exact_id', skills: ['advanced_reasoning','complex_coding','research'], preferredTasks: ['analysis','coding','research'] },
  { name: 'Qwen3.8 Flash', id: null, status: 'unverified_exact_id', skills: ['reasoning','coding','document_analysis','multimodal'], preferredTasks: ['coding','research','analysis'] },
  { name: 'Qwen3.8 27B', id: null, status: 'unverified_exact_id', skills: ['vision_language','coding','research','agents'], preferredTasks: ['vision','coding','research'] },
  { name: 'Ling 3.1 Flash', id: null, status: 'unverified_exact_id', skills: ['fast_reasoning','coding','tool_enabled_agents'], preferredTasks: ['coding','chat','research'] },
  { name: 'Decider V1.2', id: null, status: 'unverified_exact_id', skills: ['decision_selection','rubric_scoring','moderation'], preferredTasks: ['decision','decisions'] }
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

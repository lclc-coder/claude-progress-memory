// UserPromptSubmit hook: record the prompt, refresh the active-project pointer,
// and (auto mode) inject the save reminder + any keyword-relevant past records.
import { readStdin, parseInput, emit } from './lib/hookio.js';
import { writeActive, logActivity, getMode } from './lib/store.js';
import { searchObservations } from './lib/render.js';

(async () => {
  const input = parseInput(await readStdin());
  let context = '';
  try {
    const slug = writeActive(input.cwd, input.session_id);
    const prompt = String(input.prompt || '');
    logActivity(slug, input.session_id, { event: 'prompt', prompt: prompt.slice(0, 2000) });

    const mode = getMode(slug);
    const parts = [];
    if (mode === 'auto') {
      parts.push('[progress-memory] 自动模式:若本轮改动了文件或做出了决定,请在结束回答前调用 MCP 工具 memory_save 记一条(用本对话所用语言);纯问答/查询无需记录。');
    }
    const hits = searchObservations(slug, prompt, 3);
    if (hits.length) {
      const lines = hits.map((o) => `  - [${o.id}] ${o.title || ''}`).join('\n');
      parts.push(`[progress-memory] 可能相关的历史记录(需要细节就调 memory_get([ID])):\n${lines}`);
    }
    context = parts.join('\n');
  } catch {}

  const out = { continue: true, suppressOutput: true };
  if (context) out.hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext: context };
  emit(out);
})();

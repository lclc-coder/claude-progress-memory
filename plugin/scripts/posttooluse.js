// PostToolUse hook: deterministically record which files/commands a turn touched.
// No model, no auth — just appends a raw activity line.
import { readStdin, parseInput, emit } from './lib/hookio.js';
import { writeActive, logActivity } from './lib/store.js';

function extractFiles(ti) {
  if (!ti || typeof ti !== 'object') return [];
  const out = [];
  if (ti.file_path) out.push(ti.file_path);
  if (ti.notebook_path) out.push(ti.notebook_path);
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && e.file_path) out.push(e.file_path);
  return [...new Set(out)];
}

(async () => {
  const input = parseInput(await readStdin());
  try {
    const slug = writeActive(input.cwd, input.session_id);
    const tool = input.tool_name || '';
    const ti = input.tool_input || {};
    const files = extractFiles(ti);
    const event = { event: 'tool', tool };
    if (files.length) event.files = files;
    if (tool === 'Bash' && ti.command) event.command = String(ti.command).slice(0, 300);
    logActivity(slug, input.session_id, event);
  } catch {}
  emit({ continue: true, suppressOutput: true });
})();

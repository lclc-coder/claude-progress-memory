// Stop hook: close out the turn — record a turn_end marker with the files touched
// this turn. Deterministic only; the narrative summary is written by the live agent
// via memory_save (Stop cannot force the agent, per Claude Code hook semantics).
import { readStdin, parseInput, emit } from './lib/hookio.js';
import { writeActive, logActivity, readActivity } from './lib/store.js';

(async () => {
  const input = parseInput(await readStdin());
  try {
    const slug = writeActive(input.cwd, input.session_id);
    const sid = input.session_id || 'unknown';
    const acts = readActivity(slug);
    const recent = [];
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      if (a.session !== sid) continue;
      if (a.event === 'turn_end') break;
      recent.unshift(a);
    }
    const files = [...new Set(recent.flatMap((a) => a.files || []))];
    logActivity(slug, sid, { event: 'turn_end', files_touched: files, substantive: files.length > 0 });
  } catch {}
  emit({ continue: true, suppressOutput: true });
})();

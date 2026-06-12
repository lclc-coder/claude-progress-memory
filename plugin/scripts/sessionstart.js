// SessionStart hook: resolve project, render the compact progress index, inject it.
import { readStdin, parseInput, emit } from './lib/hookio.js';
import { writeActive, getMode } from './lib/store.js';
import { renderIndex } from './lib/render.js';

(async () => {
  const input = parseInput(await readStdin());
  let additionalContext = '';
  try {
    const slug = writeActive(input.cwd, input.session_id);
    additionalContext = renderIndex(slug, { mode: getMode(slug) });
  } catch {}
  emit({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
  });
})();

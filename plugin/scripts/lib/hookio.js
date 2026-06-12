// hookio.js — tiny stdin/stdout helpers shared by hook scripts. Zero deps.
export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(data); } };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      const t = setTimeout(finish, 1500);
      if (t.unref) t.unref();
    } catch { finish(); }
  });
}

export function parseInput(raw) {
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

export function emit(obj) {
  try { process.stdout.write(JSON.stringify(obj)); } catch {}
}

// render.js — compact progressive-disclosure index for SessionStart injection.
// Shows a one-line-per-record index (recent + important); full bodies fetched on demand.
import { readObservations, readSummaries, getMode } from './store.js';

const TYPE_ICON = {
  bugfix: '🔴', feature: '🟣', refactor: '🔄', change: '✅',
  discovery: '🔵', decision: '⚖️', security_alert: '🚨', security_note: '🔐',
};
const IMPORTANT = new Set(['decision', 'security_alert', 'security_note']);

function headerStamp() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA');
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase().replace(/\s/g, '');
  let tz = '';
  try { tz = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop(); } catch {}
  return `${date} ${time}${tz ? ' ' + tz : ''}`;
}
const dayOf = (e) => new Date(e).toLocaleDateString('en-CA');
const rowTime = (e) => new Date(e).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  .toLowerCase().replace(/\s/g, '').replace('am', 'a').replace('pm', 'p');

export function renderIndex(slug, opts = {}) {
  const max = opts.max ?? 60;
  const observations = readObservations(slug);
  const summaries = readSummaries(slug);
  const mode = opts.mode || getMode(slug);
  const modeLabel = mode === 'manual' ? '手动' : '自动';

  if (!observations.length && !summaries.length) {
    return `# [${slug}] 进度记忆 — ${headerStamp()}  (记录模式:${modeLabel})\n\n暂无历史记录。本项目首次启用 progress-memory。`;
  }

  // recent up to max, plus a few important (decision/security) older ones
  const sorted = [...observations].sort((a, b) => b.created_at_epoch - a.created_at_epoch);
  let selected = sorted.slice(0, max);
  if (sorted.length > max) {
    const extra = sorted.slice(max).filter((o) => IMPORTANT.has(o.type)).slice(0, 10);
    selected = selected.concat(extra);
  }
  // render oldest -> newest so the freshest sits closest to the prompt
  selected.sort((a, b) => a.created_at_epoch - b.created_at_epoch);

  const legend = Object.entries(TYPE_ICON).map(([k, e]) => `${e}${k}`).join(' ');
  const out = [
    `# [${slug}] 进度记忆 — ${headerStamp()}  (记录模式:${modeLabel})`,
    '',
    `图例: 🎯session ${legend}`,
    `格式: ID 时间 类型 标题   |   取正文: memory_get([ID...])   搜索: memory_search("关键词")`,
    `共 ${observations.length} 条记录${observations.length > selected.length ? `(下方仅显示最近 ${selected.length} 条;其余永久保留,可检索)` : ''}`,
    '',
  ];
  let lastDay = null;
  for (const o of selected) {
    const day = dayOf(o.created_at_epoch);
    if (day !== lastDay) { out.push(`### ${day}`); lastDay = day; }
    const icon = TYPE_ICON[o.type] || '•';
    out.push(`${o.id} ${rowTime(o.created_at_epoch)} ${icon} ${o.title || '(无标题)'}`);
  }

  const lastSum = summaries.length
    ? summaries.reduce((a, b) => (b.created_at_epoch > a.created_at_epoch ? b : a))
    : null;
  if (lastSum && (lastSum.completed || lastSum.next_steps)) {
    out.push('', '---');
    if (lastSum.completed) out.push(`**上次完成:** ${lastSum.completed}`);
    if (lastSum.next_steps) out.push(`**下一步:** ${lastSum.next_steps}`);
  }
  out.push('', '需要细节用 memory_get([ID...]) 取;更多历史用 memory_search 检索。');
  return out.join('\n');
}

// keyword-relevance helper for optional per-prompt injection (UserPromptSubmit)
export function searchObservations(slug, query, limit = 3) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length >= 2);
  if (!terms.length) return [];
  const hay = (o) => [o.title, o.subtitle, o.narrative, ...(o.facts || []), ...(o.concepts || [])]
    .join(' ').toLowerCase();
  return readObservations(slug)
    .map((o) => ({ o, score: terms.reduce((s, t) => s + (hay(o).includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.o.created_at_epoch - a.o.created_at_epoch)
    .slice(0, limit)
    .map((x) => x.o);
}

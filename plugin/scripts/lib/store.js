// store.js — flat-file JSONL store for claude-progress-memory.
// Pure Node, zero dependencies. No network, no auth, no native modules.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const ROOT = process.env.CLAUDE_PROGRESS_MEMORY_DIR
  ? path.resolve(process.env.CLAUDE_PROGRESS_MEMORY_DIR)
  : path.join(os.homedir(), '.claude-progress-memory');

function ensureRoot() { fs.mkdirSync(ROOT, { recursive: true }); }

// ---------- project slug (git repo root basename, else cwd basename) ----------
function gitRoot(dir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
    return out || null;
  } catch { return null; }
}

export function sanitizeSlug(name) {
  const s = String(name || '')
    .replace(/[\\/\x00-\x1f:*?"<>|]+/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  return s || 'unknown-project';
}

// Walk up from cwd to the nearest project anchor (.git, CLAUDE.md, or a
// .claude/ directory), so that working inside a subdirectory (e.g. `cd sub &&
// ...`, which persists the cwd in some harnesses) does NOT spawn a new project
// bucket. Never climbs above $HOME. The .claude anchor must skip $HOME itself:
// ~/.claude always exists, and matching it would collapse every anchor-less
// project into a single home-directory bucket.
function findProjectRoot(dir) {
  let d;
  try { d = path.resolve(dir); } catch { return null; }
  const home = os.homedir();
  for (let i = 0; i < 50; i++) {
    for (const m of ['.git', 'CLAUDE.md']) {
      try { if (fs.existsSync(path.join(d, m))) return d; } catch {}
    }
    if (d !== home) {
      try { if (fs.statSync(path.join(d, '.claude')).isDirectory()) return d; } catch {}
    }
    const parent = path.dirname(d);
    if (!parent || parent === d || d === home) break;
    d = parent;
  }
  return null;
}

export function projectSlug(cwd) {
  const base = cwd && String(cwd).trim() ? String(cwd) : process.cwd();
  let root = base;
  try { root = findProjectRoot(base) || gitRoot(base) || base; } catch { root = base; }
  return sanitizeSlug(path.basename(root));
}

export function projectDir(slug) {
  const d = path.join(ROOT, sanitizeSlug(slug));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ---------- content hash (same algorithm as claude-mem observations/store.ts) ----------
export function contentHash(sessionId, title, narrative) {
  return createHash('sha256')
    .update([sessionId || '', title || '', narrative || ''].join('\x00'))
    .digest('hex')
    .slice(0, 16);
}

// ---------- JSONL helpers ----------
export function readJsonl(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}
function appendLine(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}
function nextId(records) {
  let max = 0;
  for (const r of records) { const n = Number(r.id); if (Number.isFinite(n) && n > max) max = n; }
  return max + 1;
}

const obsFile = (slug) => path.join(projectDir(slug), 'observations.jsonl');
const sumFile = (slug) => path.join(projectDir(slug), 'summaries.jsonl');
const actFile = (slug) => path.join(projectDir(slug), 'activity.jsonl');

// Globally-unique id across BOTH observations and summaries for a project, so a
// summary id can never collide with an observation id (the read APIs merge them).
function nextIdAcross(slug) {
  return Math.max(nextId(readJsonl(obsFile(slug))), nextId(readJsonl(sumFile(slug))));
}

// ---------- observations (deduped) ----------
export function saveObservation(slug, sessionId, obs) {
  const file = obsFile(slug);
  const existing = readJsonl(file);
  const hash = contentHash(sessionId, obs.title, obs.narrative);
  const dup = existing.find((r) => r.memory_session_id === sessionId && r.content_hash === hash);
  if (dup) return { id: dup.id, deduped: true };
  const now = Date.now();
  const rec = {
    id: nextIdAcross(slug),
    kind: 'observation',
    memory_session_id: sessionId || 'unknown',
    project: slug,
    type: obs.type || 'change',
    title: obs.title || null,
    subtitle: obs.subtitle || null,
    facts: Array.isArray(obs.facts) ? obs.facts : [],
    narrative: obs.narrative || null,
    concepts: Array.isArray(obs.concepts) ? obs.concepts : [],
    files_read: Array.isArray(obs.files_read) ? obs.files_read : [],
    files_modified: Array.isArray(obs.files_modified) ? obs.files_modified : [],
    content_hash: hash,
    created_at: new Date(now).toISOString(),
    created_at_epoch: now,
  };
  appendLine(file, rec);
  return { id: rec.id, deduped: false };
}

// ---------- summaries (session checkpoints) ----------
export function saveSummary(slug, sessionId, s) {
  const file = sumFile(slug);
  const existing = readJsonl(file);
  const now = Date.now();
  const rec = {
    id: nextIdAcross(slug),
    kind: 'summary',
    memory_session_id: sessionId || 'unknown',
    project: slug,
    request: s.request || null,
    investigated: s.investigated || null,
    learned: s.learned || null,
    completed: s.completed || null,
    next_steps: s.next_steps || null,
    notes: s.notes || null,
    files_read: Array.isArray(s.files_read) ? s.files_read : [],
    files_edited: Array.isArray(s.files_edited) ? s.files_edited : [],
    created_at: new Date(now).toISOString(),
    created_at_epoch: now,
  };
  appendLine(file, rec);
  return { id: rec.id };
}

// ---------- activity (deterministic raw capture, no model) ----------
export function logActivity(slug, sessionId, event) {
  appendLine(actFile(slug), { ts: Date.now(), session: sessionId || 'unknown', ...event });
}

export const readObservations = (slug) => readJsonl(obsFile(slug));
export const readSummaries = (slug) => readJsonl(sumFile(slug));
export const readActivity = (slug) => readJsonl(actFile(slug));

// activity accumulated since the last saved summary (for /记进度 whole-stretch catch-up)
export function pendingActivity(slug) {
  const sums = readSummaries(slug);
  const last = sums.length ? sums.reduce((a, b) => (b.created_at_epoch > a.created_at_epoch ? b : a)) : null;
  const since = last ? last.created_at_epoch : 0;
  return readActivity(slug).filter((e) => (e.ts || 0) > since);
}

// ---------- active-project pointer (lets the long-lived MCP server resolve the current project) ----------
export function writeActive(cwd, sessionId) {
  try {
    ensureRoot();
    const slug = projectSlug(cwd);
    fs.writeFileSync(
      path.join(ROOT, '.active'),
      JSON.stringify({ slug, cwd: cwd || null, session: sessionId || null, ts: Date.now() }),
    );
    return slug;
  } catch {
    return projectSlug(cwd);
  }
}
export function readActiveSlug() {
  try {
    const p = path.join(ROOT, '.active');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8')).slug || null;
  } catch { return null; }
}

// ---------- mode config (auto / manual, per-project with a global default) ----------
const cfgFile = () => path.join(ROOT, 'config.json');
export function getConfig() {
  try {
    ensureRoot();
    const p = cfgFile();
    if (!fs.existsSync(p)) return { default_mode: 'auto', projects: {} };
    const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { default_mode: c.default_mode || 'auto', projects: c.projects || {} };
  } catch { return { default_mode: 'auto', projects: {} }; }
}
export function saveConfig(cfg) {
  ensureRoot();
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
}
export function getMode(slug) {
  const c = getConfig();
  return (slug && c.projects[slug]) || c.default_mode || 'auto';
}
export function setMode(mode, scope) {
  const m = mode === 'manual' ? 'manual' : 'auto';
  const c = getConfig();
  if (!scope || scope === '*' || scope === 'global') c.default_mode = m;
  else c.projects[scope] = m;
  saveConfig(c);
  return { mode: m, scope: scope || 'global' };
}

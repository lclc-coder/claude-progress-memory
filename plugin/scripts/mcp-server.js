// mcp-server.js — zero-dependency MCP stdio server (hand-rolled JSON-RPC 2.0).
// Newline-delimited JSON messages on stdin/stdout. No deps, no network, no auth.
import readline from 'node:readline';
import {
  projectSlug, sanitizeSlug, readActiveSlug,
  saveObservation, saveSummary,
  readObservations, readSummaries, pendingActivity,
  getMode, setMode,
} from './lib/store.js';

console.log = (...a) => console.error(...a); // protect stdout: it is the protocol channel

const PROC_SESSION = 'mcp-' + Math.random().toString(36).slice(2, 10);
const SERVER_INFO = { name: 'progress-memory', version: '0.1.0' };

function resolveSlug(arg) {
  if (arg && String(arg).trim()) return sanitizeSlug(arg);
  return readActiveSlug() || projectSlug(process.cwd());
}
const ok = (text) => ({ content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }] });
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });
// Read observations + summaries as one list so checkpoints are retrievable too.
const readAll = (slug) => [...readObservations(slug), ...readSummaries(slug)];
const rowTitle = (o) => o.title || o.subtitle || o.completed || o.request || o.learned || '';
const rowType = (o) => o.type || (o.kind === 'summary' ? 'summary' : 'note');
const compactRow = (o) => `${o.id} ${new Date(o.created_at_epoch).toISOString().slice(0, 16).replace('T', ' ')} ${rowType(o)} ${String(rowTitle(o)).slice(0, 80)}`;

const TOOLS = [
  {
    name: 'memory_save',
    description: '保存一条项目进度记忆(写入本地文件,无需任何鉴权)。实质轮次后调用:kind="observation" 记单个信号;kind="summary" 记会话检查点。请用当前对话所用的语言书写所有文本字段。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['observation', 'summary'], description: '默认 observation' },
        type: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'change', 'discovery', 'decision', 'security_alert', 'security_note'], description: 'observation 类型' },
        title: { type: 'string', description: '简短标题,概括核心动作' },
        subtitle: { type: 'string', description: '一句话(≤24 词)' },
        facts: { type: 'array', items: { type: 'string' }, description: '自包含事实,含文件名/数值,不用代词' },
        narrative: { type: 'string', description: '做了什么、怎么运作、为何重要' },
        concepts: { type: 'array', items: { type: 'string', enum: ['how-it-works', 'why-it-exists', 'what-changed', 'problem-solution', 'gotcha', 'pattern', 'trade-off'] } },
        files_read: { type: 'array', items: { type: 'string' } },
        files_modified: { type: 'array', items: { type: 'string' } },
        request: { type: 'string', description: 'summary 字段:本次会话诉求' },
        investigated: { type: 'string', description: 'summary 字段:探查了什么' },
        learned: { type: 'string', description: 'summary 字段:学到的机制/事实' },
        completed: { type: 'string', description: 'summary 字段:已完成/已改动' },
        next_steps: { type: 'string', description: 'summary 字段:当前/接下来要做的' },
        notes: { type: 'string', description: 'summary 字段:补充' },
        project: { type: 'string', description: '覆盖项目 slug(默认取当前活动项目)' },
      },
      required: [],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      if (a.kind === 'summary') {
        const { id } = saveSummary(slug, PROC_SESSION, a);
        return ok({ saved: 'summary', id, project: slug });
      }
      if (!a.title) return fail('memory_save(observation) 至少需要 title 与 type。');
      const { id, deduped } = saveObservation(slug, PROC_SESSION, a);
      return ok({ saved: 'observation', id, deduped, project: slug });
    },
  },
  {
    name: 'memory_search',
    description: '在当前项目的进度记忆里按关键词检索(标题/副标题/叙述/事实/概念)。返回精简索引(ID+标题),再用 memory_get 取正文。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        project: { type: 'string' },
        limit: { type: 'number', description: '默认 20' },
      },
      required: ['query'],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      const terms = String(a.query || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 1);
      const hay = (o) => [o.title, o.subtitle, o.narrative, o.request, o.investigated, o.learned, o.completed, o.next_steps, o.notes, ...(o.facts || []), ...(o.concepts || [])].join(' ').toLowerCase();
      const hits = readAll(slug)
        .map((o) => ({ o, score: terms.reduce((s, t) => s + (hay(o).includes(t) ? 1 : 0), 0) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || y.o.created_at_epoch - x.o.created_at_epoch)
        .slice(0, a.limit || 20)
        .map((x) => x.o);
      return ok(hits.length ? hits.map(compactRow).join('\n') : '无匹配记录。');
    },
  },
  {
    name: 'memory_timeline',
    description: '当前项目记忆的时间线窗口;可用 around 指定围绕某条 ID,depth 控制每侧条数。返回精简行。',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        around: { type: 'number', description: '围绕的 observation ID' },
        depth: { type: 'number', description: '每侧条数,默认 5' },
      },
      required: [],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      const all = readAll(slug).sort((x, y) => x.created_at_epoch - y.created_at_epoch);
      const d = a.depth || 5;
      let slice = all.slice(-(d * 2 + 1));
      if (a.around != null) {
        const i = all.findIndex((o) => Number(o.id) === Number(a.around));
        if (i >= 0) slice = all.slice(Math.max(0, i - d), i + d + 1);
      }
      return ok(slice.length ? slice.map(compactRow).join('\n') : '暂无记录。');
    },
  },
  {
    name: 'memory_get',
    description: '按 ID 批量取 observation 的完整正文(渐进披露的"按需取详情")。务必一次传多个 ID。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'number' } },
        project: { type: 'string' },
      },
      required: ['ids'],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      const set = new Set((a.ids || []).map(Number));
      const found = readAll(slug).filter((o) => set.has(Number(o.id)));
      return ok(found.length ? found : '未找到对应 ID。');
    },
  },
  {
    name: 'memory_pending',
    description: '返回当前项目自上次检查点(summary)以来积累的全部确定性原始留痕(每轮改了哪些文件/命令/时间)。手动 /记进度 时用它回看整段、逐项补记。',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' } },
      required: [],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      const acts = pendingActivity(slug);
      if (!acts.length) return ok('自上次检查点以来无新的文件改动留痕。');
      const lines = acts.map((e) => {
        const t = new Date(e.ts).toISOString().slice(0, 16).replace('T', ' ');
        if (e.event === 'prompt') return `${t} 提问: ${(e.prompt || '').slice(0, 120)}`;
        if (e.event === 'tool') return `${t} ${e.tool}${e.files ? ' → ' + e.files.join(', ') : ''}${e.command ? ' $ ' + e.command : ''}`;
        if (e.event === 'turn_end') return `${t} —轮结束${e.files_touched && e.files_touched.length ? ' (改动: ' + e.files_touched.join(', ') + ')' : ''}`;
        return `${t} ${e.event}`;
      });
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'memory_set_mode',
    description: '设置记录模式:auto(每轮自动记)或 manual(只在 /记进度 时手动记)。不传 project 则设为全局默认。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['auto', 'manual'] },
        project: { type: 'string', description: '项目 slug;省略=全局默认' },
      },
      required: ['mode'],
    },
    run: (a) => {
      const scope = a.project ? sanitizeSlug(a.project) : (readActiveSlug() || '*');
      const r = setMode(a.mode, scope);
      return ok({ ok: true, ...r });
    },
  },
  {
    name: 'memory_get_mode',
    description: '查询当前(或指定)项目的记录模式 auto/manual。',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' } },
      required: [],
    },
    run: (a) => {
      const slug = resolveSlug(a.project);
      return ok({ project: slug, mode: getMode(slug) });
    },
  },
];

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification: no response

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } };
  }
  if (method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === (params && params.name));
    if (!t) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params && params.name}` } };
    try {
      return { jsonrpc: '2.0', id, result: t.run((params && params.arguments) || {}) };
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `工具错误: ${e && e.message}` }], isError: true } };
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  const resp = handle(msg);
  if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
});

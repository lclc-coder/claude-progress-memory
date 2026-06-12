# claude-progress-memory

轻量、跨会话的**项目进度记忆**插件,用于 Claude Desktop / Claude Code。

## 它解决什么
- 自动记住每个项目"做到哪了、改了什么、定了什么",并在新会话开头自动注入,跨会话延续。
- **零终端、零 API key、零额外运行时、零鉴权**:不依赖任何会过期的登录 token —— 记忆由你当前已登录的会话生成,捕获由 hook 完成,存本地文件。

## 架构(一句话)
确定性 hook 捕获(每轮改了哪些文件/命令) + 当前会话经 MCP 工具 `memory_save` 写"有质量的小结" + 本地 JSONL 存储 + SessionStart 注入精简索引(渐进披露)。无后台守护进程、无 Bun/Python、无网络调用。

## 目录
```
claude-progress-memory/
├── .claude-plugin/marketplace.json     # 本地 marketplace(注册用)
└── plugin/                             # 插件本体
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                       # stdio MCP: scripts/mcp-server.js
    ├── hooks/hooks.json                # SessionStart / UserPromptSubmit / PostToolUse / Stop
    ├── scripts/                        # 纯 Node、零依赖
    │   ├── lib/store.js                # JSONL 存储、项目分库、去重、模式配置
    │   ├── lib/render.js               # 精简索引渲染
    │   ├── sessionstart.js userpromptsubmit.js posttooluse.js stop.js
    │   └── mcp-server.js               # 手写 JSON-RPC MCP 服务器
    ├── skills/progress-memory/SKILL.md # 常驻指引(何时/如何记)
    └── commands/记进度.md 记忆模式.md   # 斜杠命令
```

## 数据
存于 `~/.claude-progress-memory/<项目>/`:`observations.jsonl`(小结)、`summaries.jsonl`(会话检查点)、`raw-<会话>.jsonl`(每轮原始留痕)、`config.json`(自动/手动模式)。**永久保留、无条数上限**。

## 用法
- 自动模式(默认):每答完一轮、若有实质改动就自动记一条。
- 手动模式:`/记忆模式 手动` → 平时只留原始痕迹,`/记进度` 时一次性补记整段。
- 切换:`/记忆模式 自动 | 手动`(按项目分别设);查看:`/记忆模式`。
- 回忆:直接问"我们之前怎么定的 X",我会用 `memory_search` / `memory_get` 调取。

由 Claude 基于开源项目 claude-mem 的思路重制(去除其会过期的后台鉴权子进程)。

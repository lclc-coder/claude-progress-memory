# 在 Codex 里使用 progress-memory

让 **OpenAI Codex CLI** 也能用上这套跨会话项目进度记忆——并且和 Claude Code **共享同一份记忆**:同一个 git 仓库里,两个 agent 解析到同一个项目桶(都取仓库根目录名),数据都在本地 `~/.claude-progress-memory/<项目>/`。你用 Codex 干的活、用 Claude Code 干的活,互相都看得见。

> 本目录是**纯新增**的,不改动 `plugin/` 里的任何东西——Claude Code 的用法完全不受影响。

## 它为什么能直接复用
插件的核心是 `plugin/scripts/mcp-server.js`:一个零依赖、纯 Node、手写 JSON-RPC 的标准 **stdio MCP 服务器**。它不依赖 Claude 专有的环境变量,项目归桶只看进程的当前工作目录(向上找最近的 `.git` / `CLAUDE.md` / `.claude/` 作为锚点)。所以 Codex 把它当普通 MCP server 挂上即可,`memory_save / memory_search / memory_timeline / memory_get / memory_pending / memory_set_mode / memory_get_mode` 七个工具全部可用。

## 安装

要求:Node ≥ 18、已装 Codex CLI。先 clone 本仓库:

```bash
git clone https://github.com/lclc-coder/claude-progress-memory.git
cd claude-progress-memory
bash codex/install.sh
```

`install.sh` 幂等,做三件互不破坏的新增操作:

1. **注册 MCP 服务器** — 等价于 `codex mcp add progress-memory -- node <仓库>/plugin/scripts/mcp-server.js`(写进 `~/.codex/config.toml`)。
2. **安装技能** — 把 `codex/skills/progress-memory` 软链到 `~/.codex/skills/`,Codex 自动发现(`git pull` 后技能随之更新)。
3. **追加常驻指令** — 把一小段说明追加进 `~/.codex/AGENTS.md`,保证"会话开始先回忆、实质改动后记一条"一定触发。

装完重启 Codex 会话,`codex mcp list` 里应能看到 `progress-memory`。

### 手动安装(不想跑脚本)
1. MCP:`codex mcp add progress-memory -- node "/绝对路径/claude-progress-memory/plugin/scripts/mcp-server.js"`(或把 [`config.toml.snippet`](config.toml.snippet) 粘进 `~/.codex/config.toml`)。
2. 技能:`ln -s "$PWD/codex/skills/progress-memory" ~/.codex/skills/progress-memory`。
3. 常驻指令:把 [`AGENTS.md`](AGENTS.md) 里 `BEGIN…END` 那段追加到 `~/.codex/AGENTS.md`。

## 用法
- **回忆**:直接问"这个项目之前做到哪了 / 上次怎么定的 X",Codex 会用 `memory_timeline` / `memory_search` / `memory_get` 调取。
- **记录**:自动模式下,实质改动后 Codex 自觉记一条;说"记进度"则回看整段补记 + 存检查点。
- **模式**:说"切到手动/自动模式"即可(默认按项目;说"全局"才作用所有项目)。

## 和 Claude Code 版的差异(诚实说明)
Codex 这套靠 **MCP 工具 + 技能 + AGENTS.md 常驻指令**(模型驱动),而 Claude Code 版多了几个**确定性 hook**。因此在纯 Codex 会话里:

| 能力 | Claude Code | Codex |
|---|---|---|
| 记忆 save/search/get(MCP 工具) | ✓ | ✓ |
| 与同仓库另一个 agent 共享记忆 | ✓ | ✓ |
| 会话开始自动注入进度索引 | ✓ SessionStart hook | 由技能/AGENTS 指示模型主动 `memory_timeline` |
| 每轮自动提醒记录 | ✓ UserPromptSubmit hook | 靠模型遵循技能自觉记 |
| 每轮确定性原始留痕(`memory_pending` 的素材) | ✓ PostToolUse hook | 无(`memory_pending` 通常为空,补记以对话上下文为准) |
| 斜杠命令 `/记进度`、`/记忆模式` | ✓ | 用自然语言"记进度 / 切模式"触发等价行为 |

> 进阶(可选):Codex 0.142+ 也有 hook 系统(事件含 `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` 等),理论上可把上面三个 hook 也移植过来,做到与 Claude Code 完全对齐。但其 `[hooks]` 的确切 TOML 结构与 hook 信任模型请以你本机 `codex` 版本的官方文档为准,本仓库暂不附未经核实的 hook 配置。

## 卸载
```bash
codex mcp remove progress-memory
rm -f ~/.codex/skills/progress-memory
# 再手动删掉 ~/.codex/AGENTS.md 里 BEGIN/END progress-memory 那段即可
```
记忆数据在 `~/.claude-progress-memory/`,卸载不会删除;要清空自行删除该目录。

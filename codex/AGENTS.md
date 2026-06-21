<!--
  progress-memory · Codex 常驻指令片段
  把下面 BEGIN…END 之间的内容追加到你的 ~/.codex/AGENTS.md(全局)
  或某个项目根的 AGENTS.md(仅该项目)。codex/install.sh 会自动帮你追加(幂等)。
  作用:技能是"按相关性"被唤起的,这段常驻指令保证"会话开始先回忆 + 实质改动后记一条"一定会触发。
-->

<!-- BEGIN progress-memory -->
## 项目进度记忆(progress-memory)

本机已挂载 `progress-memory` MCP 服务器(工具:`memory_save / memory_search / memory_timeline / memory_get / memory_pending / memory_set_mode / memory_get_mode`),用于**跨会话**记录与回忆本项目进度,数据存本地 `~/.claude-progress-memory/<项目>/`,无需任何登录或 API。同一 git 仓库与 Claude Code 共享同一份记忆。

- **会话开始**:着手实质工作前,先调用一次 `memory_timeline` 回顾"本项目最近做到哪了";与诉求相关再 `memory_search`→`memory_get`。
- **实质轮次后(自动模式)**:本轮若改动了文件 / 修了 bug / 做了设计决定 / 有重要发现,就 `memory_save({kind:"observation", type, title, facts, narrative})` 记一条;纯问答、只读浏览、闲聊不记。
- **用户说"记进度"**:对自上次检查点以来每个独立工作项各记一条 observation,最后再记一条 `kind:"summary"`。
- 文本字段用当前对话所用语言书写。细节见 progress-memory 技能。
<!-- END progress-memory -->

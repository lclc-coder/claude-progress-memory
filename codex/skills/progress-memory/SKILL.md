---
name: progress-memory
description: 跨会话记录与回忆"项目进度"。当本轮对话改动了文件、修复了缺陷、做出了架构/设计决定、或得到值得留存的发现时,调用 MCP 工具 memory_save 记一条;当用户问"我们之前…/进展到哪了/上次怎么定的"时,用 memory_search→memory_get 回忆。会话开始处理实质工作前,先用 memory_timeline 回顾本项目最近进度。纯问答、状态查询、闲聊不要记录。
---

# Progress Memory(项目进度记忆 · Codex 版)

`progress-memory` MCP 服务器提供工具:`memory_save`、`memory_search`、`memory_timeline`、`memory_get`、`memory_pending`、`memory_set_mode`、`memory_get_mode`。用它跨会话保存与回忆**当前项目**的进度。记忆存在本地文件(`~/.claude-progress-memory/<项目>/`),**无需任何登录或 API**。

> 同一个 git 仓库里,Codex 与 Claude Code 解析到**同一个项目桶**(都取仓库根目录名),因此两边共享同一份进度记忆——你能读到 Claude Code 这边记的,反之亦然。

## 会话开始:先回忆(Codex 没有自动注入)
Claude Code 版靠 SessionStart hook 自动把进度索引注入上下文;Codex 没有这个机制,所以**由你主动做**:
- 在着手任何实质工作前,先调用一次 `memory_timeline`(默认取最近若干条),快速了解"本项目做到哪了"。
- 若用户的诉求与既往工作相关,再 `memory_search("关键词")` → `memory_get({ids:[...]})` 取细节。

## 何时记(每个实质轮次)
答完一轮后判断:本轮是否改变了项目或产生了值得留存的信号?
- 增删改了文件 → `memory_save({kind:"observation", type:"feature"|"refactor"|"change"|"bugfix"...})`
- 做出架构/设计/方案决定(含理由)→ `type:"decision"`
- 弄清某机制 / 发现坑 / 定位根因 → `type:"discovery"`

跳过:纯状态查询、只读浏览未得结论、闲聊、未改变任何东西的问答。跳过时什么都不做。

仅在**自动模式**下每轮主动记;**手动模式**下不要每轮记,只在用户要求"记进度"时回看补记。用 `memory_get_mode` 查当前模式。
> 注意:Codex 没有 UserPromptSubmit hook 来每轮提醒你,"自动模式"靠你遵循本技能自觉记录;也没有 PostToolUse hook 做确定性原始留痕,所以 `memory_pending` 在纯 Codex 会话里通常为空——补记时以你自己的对话上下文为准。

## 怎么记 observation
`memory_save` 传:
- `kind`: "observation"
- `type`: bugfix | feature | refactor | change | discovery | decision | security_alert | security_note
- `title`: 简短,概括核心动作
- `subtitle`: 一句话(≤24 词)
- `facts`: 2–5 条自包含陈述(含文件名/数值,不用代词)
- `narrative`: 做了什么、怎么运作、为何重要
- `concepts`: 2–5 个 how-it-works | why-it-exists | what-changed | problem-solution | gotcha | pattern | trade-off
- `files_modified` / `files_read`: 完整路径
- `project`: 若你知道当前项目 slug 就带上(否则省略,默认取当前工作目录所在项目)

**语言:title/subtitle/facts/narrative 用与当前对话相同的语言书写。**

保存按 (会话 + title + narrative) 自动去重,重复保存是无害的空操作。

## 会话检查点 / summary
工作告一段落,或用户说"记进度 / 存个检查点"时,调用 `memory_save({kind:"summary", request, investigated, learned, completed, next_steps, notes})`。`next_steps` 写"当前/接下来要做的",不是会后设想。

## 命令式触发(Codex 无斜杠命令时的等价行为)
- 用户说**"记进度"**(或"存进度 / 做个检查点"):对自上次检查点以来**每一个尚未单独记录的独立工作项**各 `memory_save({kind:"observation"})`,最后再 `memory_save({kind:"summary"})` 覆盖整段;完成后用一两句汇报记了哪些(ID + 标题)。
- 用户说**"切到手动/自动模式"**:调用 `memory_set_mode({mode:"manual"|"auto"})`(默认作用当前项目;明确说"全局/所有项目"才传 `project:"*"`);用户只问"现在什么模式"则 `memory_get_mode()`。

## 回忆既往
当用户问"之前是否做过 X / 上次怎么定的 / 进展到哪":
1. `memory_search("关键词")` → 拿到 ID 索引
2. 需要上下文 → `memory_timeline({around:<id>})`
3. `memory_get({ids:[...]})` → 取完整正文(务必批量)

不要在筛选前就取全部正文(省 token)。

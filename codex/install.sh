#!/usr/bin/env bash
# progress-memory · Codex 一键安装(幂等,可重复执行)
#
# 做三件事,都只新增、不破坏既有配置:
#   1) 用 `codex mcp add` 把本仓库的 MCP 服务器注册进 ~/.codex/config.toml
#   2) 把 progress-memory 技能软链到 ~/.codex/skills/(Codex 自动发现)
#   3) 把常驻指令片段追加进 ~/.codex/AGENTS.md(已存在则跳过)
#
# 用法:  bash codex/install.sh
set -euo pipefail

# --- 路径解析 ----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER="$REPO_ROOT/plugin/scripts/mcp-server.js"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SKILLS_DIR="$CODEX_HOME/skills"
AGENTS_FILE="$CODEX_HOME/AGENTS.md"

say() { printf '  %s\n' "$*"; }

echo "progress-memory · Codex 安装"
echo "  仓库:      $REPO_ROOT"
echo "  CODEX_HOME: $CODEX_HOME"
echo

# --- 前置检查 ----------------------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "✗ 未找到 node(需要 Node ≥ 18)。先装 Node 再重试。" >&2; exit 1; }
[ -f "$SERVER" ] || { echo "✗ 找不到 MCP 服务器: $SERVER(请在 clone 出来的仓库根目录运行)。" >&2; exit 1; }
mkdir -p "$CODEX_HOME" "$SKILLS_DIR"

# --- 1) 注册 MCP 服务器 ------------------------------------------------------
echo "[1/3] 注册 MCP 服务器 progress-memory"
if command -v codex >/dev/null 2>&1; then
  if codex mcp get progress-memory >/dev/null 2>&1; then
    say "已存在,跳过(如需更新路径:codex mcp remove progress-memory 后重跑)。"
  else
    codex mcp add progress-memory -- node "$SERVER"
    say "✓ 已写入 ~/.codex/config.toml"
  fi
else
  say "未找到 codex CLI;请手动把 codex/config.toml.snippet 的内容粘进 ~/.codex/config.toml,"
  say "并把路径设为: $SERVER"
fi
echo

# --- 2) 安装技能(软链) ------------------------------------------------------
echo "[2/3] 安装技能 → $SKILLS_DIR/progress-memory"
SKILL_SRC="$SCRIPT_DIR/skills/progress-memory"
SKILL_DST="$SKILLS_DIR/progress-memory"
if [ -L "$SKILL_DST" ] && [ "$(readlink "$SKILL_DST")" = "$SKILL_SRC" ]; then
  say "软链已存在且正确,跳过。"
elif [ -e "$SKILL_DST" ]; then
  say "⚠ $SKILL_DST 已存在(非本仓库软链)。未覆盖。如确认要替换:rm -rf \"$SKILL_DST\" 后重跑。"
else
  ln -s "$SKILL_SRC" "$SKILL_DST"
  say "✓ 已软链(git pull 后技能自动更新)。"
fi
echo

# --- 3) 追加常驻指令到 AGENTS.md(幂等) -------------------------------------
echo "[3/3] 追加常驻指令 → $AGENTS_FILE"
if [ -f "$AGENTS_FILE" ] && grep -q "BEGIN progress-memory" "$AGENTS_FILE" 2>/dev/null; then
  say "已包含 progress-memory 段,跳过。"
else
  # 只抽取 BEGIN…END 之间(含)那段,追加到全局 AGENTS.md
  block="$(awk '/<!-- BEGIN progress-memory -->/{f=1} f{print} /<!-- END progress-memory -->/{f=0}' "$SCRIPT_DIR/AGENTS.md")"
  { [ -f "$AGENTS_FILE" ] && printf '\n'; printf '%s\n' "$block"; } >> "$AGENTS_FILE"
  say "✓ 已追加(只新增,未改动你原有内容)。"
fi
echo

echo "完成。重启 Codex 会话后:"
echo "  • 用 \`codex mcp list\` 应能看到 progress-memory"
echo "  • 进度记忆与 Claude Code 在同一 git 仓库内共享(数据在 ~/.claude-progress-memory/)"

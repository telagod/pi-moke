#!/usr/bin/env bash
# 墨客（MoKe）启动器 —— 一键开箱：人格 + skills + 扩展包 + 界面设置
# 用法: ./install.sh   (或 curl -fsSL <url> | bash)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || echo "$PWD")"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
TS="$(date +%Y%m%d-%H%M%S)"
MOKE_REPO="${MOKE_REPO:-https://github.com/telagod/pi-moke}"

say()  { printf '\033[1;32m[moke]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[moke]\033[0m %s\n' "$*"; }

# ---- 0. 前置检查 ----
command -v node >/dev/null 2>&1 || { warn "未找到 node —— 请先安装 Node.js ≥ 20: https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { warn "未找到 npm"; exit 1; }

# ---- 0.5 管道安装(curl | bash)时无仓库目录,先克隆到固定位置 ----
if [ ! -f "$REPO_DIR/AGENTS.md" ]; then
  warn "经管道安装(无本地仓库),克隆 $MOKE_REPO 到 ~/.pi-moke ..."
  command -v git >/dev/null 2>&1 || { warn "未找到 git,请先手动 clone 本仓库再运行"; exit 1; }
  if [ ! -d "$HOME/.pi-moke/.git" ]; then
    git clone --depth 1 "$MOKE_REPO" "$HOME/.pi-moke"
  else
    git -C "$HOME/.pi-moke" pull --ff-only || true
  fi
  exec "$HOME/.pi-moke/install.sh"
fi

# ---- 1. 安装 pi(如缺) ----
if command -v pi >/dev/null 2>&1; then
  say "pi 已安装: $(pi --version 2>/dev/null || echo '?')"
else
  say "未找到 pi,正在全局安装 @earendil-works/pi-coding-agent ..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
fi

# ---- 2. 写 AGENTS.md(墨客人格) ----
mkdir -p "$AGENT_DIR"
if [ -f "$AGENT_DIR/AGENTS.md" ]; then
  cp "$AGENT_DIR/AGENTS.md" "$AGENT_DIR/AGENTS.md.bak-$TS"
  warn "已有 AGENTS.md,已备份为 AGENTS.md.bak-$TS"
fi
cp "$REPO_DIR/AGENTS.md" "$AGENT_DIR/AGENTS.md"
say "人格已写入 $AGENT_DIR/AGENTS.md"

# ---- 3. 合并 settings.json(不动 provider/key) ----
SETTINGS="$AGENT_DIR/settings.json"
node - "$SETTINGS" "$REPO_DIR/settings.template.json" <<'NODE'
const fs = require('fs');
const [settingsPath, templatePath] = process.argv.slice(2);
const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
const merged = { ...tpl, ...existing };
if (existing.packages) {
  const seen = new Set();
  merged.packages = [...existing.packages, ...(tpl.packages || [])].filter(p => (seen.has(p) ? false : (seen.add(p), true)));
}
// 模板有而原配置无的键补上(如 theme / compaction),原值优先
for (const k of Object.keys(tpl)) if (!(k in existing)) merged[k] = tpl[k];
fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');
console.log('[moke] settings.json 合并完成: packages=' + (merged.packages || []).length +
  ' theme=' + (merged.theme || '-') + ' (provider/model 未改动)');
NODE

# ---- 4. 安装 pi-moke 包(skills) ----
say "安装 pi-moke 技能包 ..."
pi install "$REPO_DIR/pi-package"

# ---- 5. 收尾 ----
cat <<'EOF'

╭──────────────────────────────────────────────╮
│  墨客（MoKe）安装完毕                          │
├──────────────────────────────────────────────┤
│  下一步(缺一不可):                            │
│  1. 配置模型:  pi config   → 设 provider/key │
│     (或设环境变量, 如 ANTHROPIC_API_KEY=...)  │
│  2. 验证:      在 pi 里键入 `在吗`             │
│     当得:  墨客在此，客有何差遣？              │
│  3. 常用命令:  pi update --all  升级          │
│     恢复备份:  cp ~/.pi/agent/AGENTS.md.bak-* │
│                ~/.pi/agent/AGENTS.md          │
╰──────────────────────────────────────────────╯
EOF

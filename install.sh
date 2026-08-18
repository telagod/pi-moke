#!/usr/bin/env bash
# 墨客（MoKe）启动器 —— 一键开箱：人格 + skills + 扩展包 + 界面设置
# 用法: ./install.sh [--bun|--sync|--doctor]   (或 curl -fsSL <url> | bash)
#   --bun     强制用 bun 启动 pi(需已装 bun;验证失败自动回退 node)
#   --sync    合成人格、落盘 ~/.pi/agent、绝对路径重装本家包
#   --doctor  检查人格/快压/包路径/seagull 残留
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || echo "$PWD")"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
TS="$(date +%Y%m%d-%H%M%S)"
MOKE_REPO="${MOKE_REPO:-https://github.com/telagod/pi-moke}"
FORCE_BUN=0
MODE=install
for arg in "$@"; do
  case "$arg" in
    --bun) FORCE_BUN=1 ;;
    --sync) MODE=sync ;;
    --doctor) MODE=doctor ;;
    -h|--help)
      printf '用法: ./install.sh [--bun|--sync|--doctor]\n'
      exit 0
      ;;
  esac
done

say()  { printf '\033[1;32m[moke]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[moke]\033[0m %s\n' "$*"; }

moke_pin_package() {
  local settings="$AGENT_DIR/settings.json"
  local pkg="$REPO_DIR/pi-package"
  [ -d "$pkg" ] || { warn "无 $pkg"; return 1; }
  command -v pi >/dev/null 2>&1 && pi install "$pkg"
  # pi install 常写成相对路径,事后钉死绝对路径,换机器才不会断。
  if [ -f "$settings" ]; then
    node -e '
      const fs = require("fs");
      const p = process.argv[1], pkg = process.argv[2];
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      const pkgs = (d.packages || []).filter((x) => !/pi-moke|pi-package/.test(String(x)));
      const i = pkgs.findIndex((x) => String(x).includes("pi-safe-compact"));
      if (i >= 0) pkgs.splice(i, 0, pkg);
      else pkgs.push(pkg);
      d.packages = pkgs;
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
    ' "$settings" "$pkg"
  fi
}

moke_sync() {
  [ -f "$REPO_DIR/sources/build.sh" ] || { warn "非仓库目录: $REPO_DIR"; return 1; }
  bash "$REPO_DIR/sources/build.sh"
  mkdir -p "$AGENT_DIR"
  if [ -f "$AGENT_DIR/AGENTS.md" ]; then
    cp "$AGENT_DIR/AGENTS.md" "$AGENT_DIR/AGENTS.md.bak-$TS"
  fi
  cp "$REPO_DIR/AGENTS.md" "$AGENT_DIR/AGENTS.md"
  moke_pin_package
  say "已同步人格与快压包 → $AGENT_DIR"
}

moke_doctor() {
  local fail=0
  ok() { say "ok  $1"; }
  bad() { warn "FAIL $1"; fail=1; }
  grep -q "墨客在此，客有何差遣" "$REPO_DIR/AGENTS.md" 2>/dev/null && ok "仓库人格激活句" || bad "仓库人格激活句"
  grep -q "墨客快压" "$REPO_DIR/AGENTS.md" 2>/dev/null && ok "仓库含快压" || bad "仓库含快压"
  grep -qE '\$seagull-(reverse|pentest|memory|lab)' "$REPO_DIR/AGENTS.md" 2>/dev/null && bad "仓库仍有 seagull 死路由" || ok "无 seagull 死路由"
  grep -q "墨客在此，客有何差遣" "$AGENT_DIR/AGENTS.md" 2>/dev/null && ok "本地人格已落盘" || bad "本地人格已落盘"
  [ -f "$REPO_DIR/pi-package/extensions/fast-compress.ts" ] && ok "快压扩展存在" || bad "快压扩展存在"
  [ -f "$REPO_DIR/pi-package/extensions/compact-guard.ts" ] && ok "compact-guard 存在" || bad "compact-guard 存在"
  grep -q "fast-compress.ts" "$REPO_DIR/pi-package/package.json" 2>/dev/null && ok "package.json 声明扩展" || bad "package.json 声明扩展"
  if [ -f "$AGENT_DIR/settings.json" ]; then
    if node -e '
      const fs = require("fs"); const path = require("path");
      const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const agent = process.argv[2];
      const p = (d.packages || []).find((x) => /pi-package|pi-moke/.test(String(x)));
      if (!p) process.exit(1);
      process.exit(fs.existsSync(p) || fs.existsSync(path.resolve(agent, p)) ? 0 : 1);
    ' "$AGENT_DIR/settings.json" "$AGENT_DIR"; then
      ok "settings 包路径可解析"
    else
      bad "settings 包路径可解析"
    fi
    grep -q "桌面/pi-moke" "$AGENT_DIR/settings.json" && bad "无失效桌面路径" || ok "无失效桌面路径"
  else
    bad "无 $AGENT_DIR/settings.json"
  fi
  grep -qE '\$seagull-(reverse|pentest|memory|lab)' "$AGENT_DIR/AGENTS.md" 2>/dev/null && bad "本地人格无 seagull" || ok "本地人格无 seagull"
  [ "$fail" -eq 0 ] && say "doctor: 全过" || { warn "doctor: 有失败"; return 1; }
}

if [ "$MODE" = doctor ]; then moke_doctor; exit $?; fi
if [ "$MODE" = sync ]; then moke_sync; exit $?; fi

# ---- 0. 前置检查与统一依赖安装 ----
#   Linux / macOS / WSL / Termux 走同一条路:mise(https://mise.run) 装 node@lts。
#   Windows 原生 Git Bash 提示用 WSL2,不阻断。
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    warn "检测到 Windows 环境:建议改用 WSL2(https://learn.microsoft.com/windows/wsl)获得完整体验"
    ;;
esac
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || \
   ! node --version 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
  if command -v curl >/dev/null 2>&1; then
    say "node 缺失或版本过低(需 ≥22),统一安装依赖(mise + node@lts)..."
    curl -fsSL https://mise.run | sh
    export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
    command -v mise >/dev/null 2>&1 || { warn "mise 安装失败,请手动装 node ≥ 20: https://nodejs.org"; exit 1; }
    MISE_YES=1 mise use -g node@lts 2>/dev/null || { mise install node@lts >/dev/null 2>&1; MISE_YES=1 mise use -g node@lts; }
  else
    warn "未找到 node 与 curl,请先手动安装 node ≥ 20: https://nodejs.org"
    exit 1
  fi
  # 复查:必须命中 ≥22 的 node,否则明确报错(防系统旧 node 顶替)
  if ! command -v node >/dev/null 2>&1 || ! node --version 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
    warn "node 仍不可用或版本过低(需 ≥22,当前 $(node --version 2>/dev/null || echo 无))。请手动安装 node ≥ 22 后重试"
    exit 1
  fi
fi
say "node: $(node --version 2>/dev/null || echo '?') | npm: $(npm --version 2>/dev/null || echo '?')"

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
NEW_INSTALL=0
if command -v pi >/dev/null 2>&1; then
  say "pi 已安装: $(pi --version 2>/dev/null || echo '?')"
else
  say "未找到 pi,正在全局安装 @earendil-works/pi-coding-agent ..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  NEW_INSTALL=1
fi

# ---- 1.5 启动优化:内存参数 + bun 启动(如可用) ----
#   原理:pi 的 bin 指向 dist/cli.js,首行 shebang 即启动方式。
#   node: --max-old-space-size=512 --max-semi-space-size=32(与作者本机一致)
#   bun:  --max-old-space-size=512(bun 兼容该 V8 标志)
#   幂等:已含参数即跳过;换 bun 后验证失败自动回退 node。
#   定位不依赖平台命令:先跟软链,再用 npm root -g 兜底(适配 mise shims)。
locate_pi() {
  local bin real npmroot
  bin="$(command -v pi 2>/dev/null)"; [ -n "$bin" ] || return 1
  real="$(readlink -f "$bin" 2>/dev/null)" || \
    real="$(node -e "process.stdout.write(require('fs').realpathSync(process.argv[1]))" "$bin" 2>/dev/null)" || \
    real="$bin"
  case "$real" in
    *node_modules/@earendil-works/pi-coding-agent/dist/cli.js) echo "$real"; return 0 ;;
  esac
  npmroot="$(npm root -g 2>/dev/null || true)"
  if [ -n "$npmroot" ] && [ -f "$npmroot/@earendil-works/pi-coding-agent/dist/cli.js" ]; then
    echo "$npmroot/@earendil-works/pi-coding-agent/dist/cli.js"; return 0
  fi
  return 1
}
if command -v pi >/dev/null 2>&1; then
  PI_REAL="$(locate_pi || true)"
  if [ -n "$PI_REAL" ] && [ -f "$PI_REAL" ] && [ "$(head -c 2 "$PI_REAL")" = "#!" ]; then
    if [ "$FORCE_BUN" = 1 ] && command -v bun >/dev/null 2>&1; then
      RUNNER=bun; FLAGS="--max-old-space-size=512"
    elif [ "$NEW_INSTALL" = 1 ] && command -v bun >/dev/null 2>&1; then
      RUNNER=bun; FLAGS="--max-old-space-size=512"
    else
      RUNNER=node; FLAGS="--max-old-space-size=512 --max-semi-space-size=32"
    fi
    SHEBANG="#!/usr/bin/env -S $RUNNER $FLAGS"
    if [ "$(head -1 "$PI_REAL")" != "$SHEBANG" ]; then
      say "启用 $RUNNER 启动 + 内存优化: $SHEBANG"
      sed -i.bak "1c$SHEBANG" "$PI_REAL" && rm -f "$PI_REAL.bak"
      if ! pi --version >/dev/null 2>&1; then
        warn "$RUNNER 启动验证失败,回退 node ..."
        sed -i.bak "1c#!/usr/bin/env -S node --max-old-space-size=512 --max-semi-space-size=32" "$PI_REAL" && rm -f "$PI_REAL.bak"
      fi
    else
      say "启动优化已生效($RUNNER,内存参数在位)"
    fi
  else
    warn "无法定位 pi 启动脚本,跳过启动优化"
  fi
fi

# ---- 1.8 扩展兼容:pi-thinking-ui 需从解析链找到 pi 本体 ----
#   @fyeeme/pi-thinking-ui 用 import.meta.resolve("@earendil-works/pi-coding-agent")
#   定位 pi 包根;扩展装在 ~/.pi/agent/npm 下,而 pi 本体在 npm 全局,链不到。
#   软链进扩展解析链即可(可逆,pi 重装包时若清掉,重跑 install.sh 会重建)。
fix_thinking_ui() {
  local agent_npm="$AGENT_DIR/npm/node_modules"
  [ -d "$agent_npm/@fyeeme/pi-thinking-ui" ] || return 0
  local target="$(npm root -g 2>/dev/null)/@earendil-works/pi-coding-agent"
  [ -d "$target" ] || return 0
  mkdir -p "$agent_npm/@earendil-works"
  if [ ! -e "$agent_npm/@earendil-works/pi-coding-agent" ]; then
    ln -s "$target" "$agent_npm/@earendil-works/pi-coding-agent"
    say "Thinking UI 兼容修复:已链接 pi 本体到扩展解析链"
  fi
}
fix_thinking_ui

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

# ---- 3b. hermes 记忆审查:只看近窗、关 thinking,避免 120s×2 超时 ----
HERMES_CFG="$AGENT_DIR/hermes-memory-config.json"
HERMES_TPL="$REPO_DIR/hermes-memory-config.template.json"
if [ -f "$HERMES_TPL" ]; then
  if [ ! -f "$HERMES_CFG" ]; then
    cp "$HERMES_TPL" "$HERMES_CFG"
    say "已写入 $HERMES_CFG"
  else
    node - "$HERMES_CFG" "$HERMES_TPL" <<'NODE'
const fs = require('fs');
const [cfgPath, tplPath] = process.argv.slice(2);
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
const existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const merged = { ...tpl, ...existing };
for (const k of Object.keys(tpl)) if (!(k in existing)) merged[k] = tpl[k];
fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2) + '\n');
NODE
    say "已合并 $HERMES_CFG"
  fi
fi

# ---- 3c. pi-goal 自动续跑: 默认不设轮次帽 (null = Unlimited) ----
GOAL_CFG="$AGENT_DIR/pi-goal.json"
GOAL_TPL="$REPO_DIR/pi-goal.template.json"
if [ -f "$GOAL_TPL" ]; then
  if [ ! -f "$GOAL_CFG" ]; then
    cp "$GOAL_TPL" "$GOAL_CFG"
    say "已写入 $GOAL_CFG"
  else
    node - "$GOAL_CFG" "$GOAL_TPL" <<'NODE'
const fs = require('fs');
const [cfgPath, tplPath] = process.argv.slice(2);
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
const existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const merged = { ...tpl, ...existing };
const tplTurns = tpl.continuationLimits && tpl.continuationLimits.automaticTurns;
const oldTurns = existing.continuationLimits && existing.continuationLimits.automaticTurns;
const shipped = new Set([25, 100, 250]);
const automaticTurns = oldTurns === null || (typeof oldTurns === 'number' && !shipped.has(oldTurns))
  ? oldTurns
  : (Object.hasOwn(tpl.continuationLimits || {}, 'automaticTurns') ? tplTurns : null);
merged.continuationLimits = {
  ...(tpl.continuationLimits || {}),
  ...(existing.continuationLimits || {}),
  automaticTurns,
};
fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2) + '\n');
NODE
    say "已合并 $GOAL_CFG"
  fi
fi

# ---- 4. 安装 pi-moke 包(skills) ----
say "安装 pi-moke 技能包 ..."
moke_pin_package

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

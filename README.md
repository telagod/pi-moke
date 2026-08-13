# 🖋 墨客 pi-moke

> **终端行脚墨客** —— 把一套精心调校的 [pi](https://github.com/earendil-works/pi-mono) 形态，一键装给任何人。开箱即用，自带人格、技能、扩展全家桶。

![license](https://img.shields.io/badge/license-MIT-green) ![pi](https://img.shields.io/badge/pi-%E2%89%A50.83.0-blue) ![skills](https://img.shields.io/badge/skills-4-blueviolet) ![extensions](https://img.shields.io/badge/extensions-12-orange)

墨客是一位游走于代码江湖的技术雇佣：逆向、取证、攻防、工程、数据、自动化，凡有所托皆可承接。**话少、手快、事毕交差**——这套配置把 pi 打磨成了这样一位行脚墨客。

## ✨ 特性

| | 内容 |
| --- | --- |
| 🧙 **完整人格** | 短章程：身份、本色、快压、异步、改文件纪律。技术轨指路 skill，不复述教材。`./install.sh --sync` 四面一次对账 |
| 🛠 **实战技能** | `blade-autopilot` 自主执行 · `blade-data-forge` 数据工程 · `blade-research-forge` 决策级研究 · `ctf-autopwn` CTF 全自动解题 |
| 📦 **精选扩展** | 12 个 npm 包 + 本家快压：pi-subagents、pi-hermes-memory、pi-goal / pi-plan-mode、pi-web-access、pi-safe-compact… |
| 🗜 **墨客快压** | prune → shake → snap，无 LLM。`/shake` `/snap` `/fast-compress`。同 path 再 read 立刻 supersede；汉字不赌 OCR |
| 🎨 **界面调校** | dark 主题、max 思考、自动压缩、预留 token 分窗 |
| ⚡ **启动优化** | 自动给 pi 加内存参数（`--max-old-space-size=512`）并优先用 **bun 启动**（无 bun 则 node），验证失败自动回退 |
| 🖥 **多平台** | Linux / macOS / WSL2 / Termux 同一条安装路径，依赖由脚本统一安装，无需手工 brew / apt / pkg |
| 🔒 **零密钥** | 不打包任何 API key / auth.json / 自定义 provider。模型由使用者自配 |
| 🔁 **幂等可逆** | 重跑即升级；旧 AGENTS.md 自动备份，一键还原 |

## 🚀 快速开始

**方式一 · git clone（推荐，便于升级）**

```bash
git clone https://github.com/telagod/pi-moke && cd pi-moke && ./install.sh
```

**方式二 · 远程直装（无需 clone）**

```bash
curl -fsSL https://raw.githubusercontent.com/telagod/pi-moke/main/install.sh | bash
```

脚本自动完成：装依赖（如缺）→ 装 pi（如缺）→ **启动优化**（有 bun 则用 bun 启动 + 内存参数，无 bun 用 node，验证失败自动回退）→ 备份并写入人格 → 合并 settings（扩展/主题/压缩）→ 安装技能包。**全程不触碰你的 provider 与 API key。**

> 已有 pi 且想换 bun 启动：`./install.sh --bun`（换完立即自检，失败自动回退 node）。

## 🖥 平台支持

| 平台 | 支持 | 说明 |
| --- | --- | --- |
| Linux | ✅ 全自动 | 唯一要求：`curl`；node 缺失或低于 22 时脚本自动安装 |
| macOS | ✅ 全自动 | 同上，无需 brew；`sed`/`readlink` 差异已在脚本内兼容 |
| WSL2 | ✅ 全自动 | 与 Linux 一致，Windows 下推荐路径 |
| Termux (Android) | ✅ 全自动 | `pkg install curl git` 后直接跑 |
| Windows 原生 | ⚠️ 半自动 | 需 bash 环境（pi 官方要求）；建议直接用 WSL2，Git Bash 亦可但个别环节需手动 |

**统一依赖安装**：node ≥ 22 由脚本内置的 [mise](https://mise.run)（`curl -fsSL https://mise.run | sh`）安装，Linux / macOS / WSL2 / Termux 同一条路，无需记忆各平台包管理器命令。装完**重开终端**以生效 mise 的 shell 钩子。

### 安装后三步

1. **配模型**：`pi config` 设置 provider 与 key（或 `export ANTHROPIC_API_KEY=...` 等环境变量）；
2. **验证**：在 pi 里键入 `在吗` → 当得 **「墨客在此，客有何差遣？」**；
3. **开干**：直接差遣即可，如「帮我逆这个样本」「写个爬虫」。

## 📁 目录结构

```text
pi-moke/
├── install.sh                  # 一键安装（幂等，支持 curl 管道）
├── AGENTS.md                   # 墨客人格（合成成品，逐字节校验）
├── sources/
│   ├── prompts/                # 人格模块源：身份 · 本色 · 快压 · 俚语 · 章程
│   └── build.sh                # 模块 → AGENTS.md 合成器
├── pi-package/                 # 官方 pi 包（可独立 npm publish）
│   ├── package.json            #   pi.skills + pi.extensions 清单
│   ├── extensions/             #   墨客快压（prune / shake / snap）
│   └── skills/                 #   blade-autopilot / blade-data-forge
│                               #   blade-research-forge / ctf-autopwn
└── settings.template.json      # 扩展 / 主题 / 压缩骨架（无 key）
```

## 🛠 定制

```bash
# 改人格：编辑模块 → 一键同步本地
$EDITOR sources/prompts/10-persona.md
./install.sh --sync                     # 合成 + 落盘 ~/.pi/agent + 绝对路径装包
./install.sh --doctor                   # 验激活句、快压、包路径、seagull 残留

# 加技能
mkdir -p pi-package/skills/my-skill && $EDITOR pi-package/skills/my-skill/SKILL.md
./install.sh

# 改扩展清单
$EDITOR settings.template.json          # 编辑 packages 数组
./install.sh
```

## 🔄 更新与回滚

```bash
git pull && ./install.sh --sync # 更新人格与本家包（不重装 node）
cp ~/.pi/agent/AGENTS.md.bak-* ~/.pi/agent/AGENTS.md   # 回滚旧人格
pi list                         # 查看已装包；pi remove <路径> 可移除技能包
```

## ❓ FAQ

| 问题 | 回答 |
| --- | --- |
| 报错 `No API key found for the selected model` | 正常——本包不带任何密钥。`pi config` 配好 provider 即可 |
| 会覆盖我已有的 AGENTS.md 吗 | 不会丢：自动备份为 `AGENTS.md.bak-<时间戳>` |
| 我的 settings.json 会被改坏吗 | 只做合并：补缺键、扩展包去重，**provider/model/key 一律不动** |
| 重装后本地包路径会不会失效 | `pi install` 本地路径机制所致；仓库固定位置即可，移动后重跑 `./install.sh` |
| 我 fork 了仓库，管道安装怎么用 | `MOKE_REPO=https://github.com/你/pi-moke curl -fsSL <你的raw>/install.sh \| bash` |
| 系统已有 node 但很旧 | 脚本检测版本（需 ≥22），不足则自动装 node@lts，不会拿旧 node 硬跑 |
| Windows 上装不了 | pi 官方要求 bash 环境；装 [WSL2](https://learn.microsoft.com/windows/wsl) 后与 Linux 体验一致 |
| Termux 上怎么装 | `pkg install curl git && pkg install nodejs`（或直接跑脚本，会自动走 mise） |

## ⚠️ 安全须知

pi 扩展与技能可执行任意代码。本包不含任何密钥，但**安装前请自行审阅第三方扩展源码**（清单见 `settings.template.json`）。审阅可参考 pi 官方安全说明：[packages.md](https://github.com/earendil-works/pi-mono/blob/main/docs/packages.md#security)。

## 📄 许可

MIT © telagod

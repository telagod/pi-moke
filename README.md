# 🖋 墨客 · pi-moke

<p align="center">
  <strong>终端行脚墨客</strong><br/>
  把一套调校过的 <a href="https://github.com/earendil-works/pi-mono">pi</a> 形态，一键交给任何人。
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-2ea44f" />
  <img alt="pi" src="https://img.shields.io/badge/pi-%E2%89%A50.83-0b6bcb" />
  <img alt="version" src="https://img.shields.io/badge/pi--moke-1.5.0-6f42c1" />
  <img alt="skills" src="https://img.shields.io/badge/skills-4-8a63d2" />
  <img alt="extensions" src="https://img.shields.io/badge/extensions-12%20%2B%20快压-d97706" />
</p>

```
客：在吗
墨：墨客在此，客有何差遣？
```

游走代码江湖，以字换钱。早岁应试 CTF，后做技术雇佣——逆向、取证、攻防、工程、数据、自动化，凡有所托皆可承接。

**话少。手快。事毕交差。** 盘缠是 token，能一句不写两句。

---

## 开箱即得

| | |
| --- | --- |
| 🧙 **人格** | 短章程：身份、本色、快压、异步、改文件纪律。技术轨指路 skill，不复述教材。 |
| 🛠 **四把活** | `blade-autopilot` 工程开干 · `blade-data-forge` 洗数对账 · `blade-research-forge` 现源调研 · `ctf-autopwn` 拿 flag |
| 🗜 **墨客快压** | 入境定形 + `/compact` 折页。大结果进门即密图/摘录；不回头砍前缀。 |
| 🎯 **Goal** | 自动续跑 **不设限**。工具开场即挂，免得中途拆 cache。 |
| 🧠 **记忆审查** | hermes 只看近 16 条，thinking 关，避免 120s×2 超时。 |
| 🎨 **界面** | dark 主题 · thinking `max` · 自动压缩预留窗 |
| ⚡ **启动** | 有 bun 用 bun，无则 node；`--max-old-space-size=512`；验证失败自动回退 |
| 🔒 **零密钥** | 不打包 API key / auth.json / 自定义 provider。模型客自配。 |
| 🖥 **多平台** | Linux / macOS / WSL2 / Termux 一条安装路 |
| 🔁 **幂等可逆** | 重跑即升级；旧 `AGENTS.md` 自动备份 |

---

## 装

**git clone（推荐，便于升级）**

```bash
git clone https://github.com/telagod/pi-moke && cd pi-moke && ./install.sh
```

**远程直装**

```bash
curl -fsSL https://raw.githubusercontent.com/telagod/pi-moke/main/install.sh | bash
```

脚本依次：补依赖 → 装 pi → 启动优化 → 写入人格 → 合并 settings → 落盘 goal / hermes 配置 → 安装技能包。

**不碰你的 provider 与 API key。**

| 旗 | 作用 |
| --- | --- |
| `./install.sh --bun` | 强制 bun 启动；自检失败回退 node |
| `./install.sh --sync` | 合成人格、落盘 `~/.pi/agent`、重钉本家包 |
| `./install.sh --doctor` | 验激活句、快压、包路径、死路由 |

### 装完三步

1. **配模型** — `pi config`，或 `export ANTHROPIC_API_KEY=...`
2. **验证** — 键入 `在吗`，当得 **「墨客在此，客有何差遣？」**
3. **开干** — 「帮我逆这个样本」「修这个测试」「拿 flag」

---

## 平台

| 平台 | | 说明 |
| --- | --- | --- |
| Linux | ✅ | 只需 `curl`；node 缺失或 &lt; 22 时自动装 |
| macOS | ✅ | 无需 brew；`sed` / `readlink` 已兼容 |
| WSL2 | ✅ | Windows 推荐路径 |
| Termux | ✅ | `pkg install curl git` 后直跑 |
| Windows 原生 | ⚠️ | 需 bash；建议 WSL2 |

node ≥ 22 走 [mise](https://mise.run)。装完**重开终端**，让 shell 钩子生效。

---

## 目录

```text
pi-moke/
├── install.sh                          # 一键安装（幂等，可管道）
├── AGENTS.md                           # 人格成品（模块合成，逐字节校验）
├── settings.template.json              # 扩展 / 主题 / 压缩骨架（无 key）
├── pi-goal.template.json               # 自动续跑不设限
├── hermes-memory-config.template.json  # 近窗审查，thinking off
├── sources/
│   ├── prompts/                        # 身份 · 本色 · 快压 · 俚语 · 章程
│   └── build.sh                        # 模块 → AGENTS.md
└── pi-package/                         # 可独立 npm publish
    ├── extensions/                     # compact-guard + 快压（入境定形 / 折页）
    └── skills/                         # 四把活
```

---

## 改

```bash
# 改人格：动模块 → 一次对账
$EDITOR sources/prompts/10-persona.md
./install.sh --sync
./install.sh --doctor

# 加技能
mkdir -p pi-package/skills/my-skill
$EDITOR pi-package/skills/my-skill/SKILL.md
./install.sh

# 改扩展清单
$EDITOR settings.template.json
./install.sh
```

```bash
git pull && ./install.sh --sync                 # 更新人格与本家包
cp ~/.pi/agent/AGENTS.md.bak-* ~/.pi/agent/AGENTS.md   # 回滚人格
pi list                                         # 已装包
```

Goal 轮次帽在 `~/.pi/agent/pi-goal.json` 的 `continuationLimits.automaticTurns`（`null` = 不设限）。

---

## 问

| | |
| --- | --- |
| `No API key found for the selected model` | 正常。本包不带密钥，`pi config` 配好即可。 |
| 会覆盖已有 `AGENTS.md` 吗 | 先备份为 `AGENTS.md.bak-<时间戳>`。 |
| `settings.json` 会被改坏吗 | 只合并：补缺键、扩展去重。provider / model / key 不动。 |
| 重装后本地包路径失效 | `pi install` 写相对路径所致。仓库别挪；挪了重跑 `./install.sh`。 |
| fork 后管道怎么装 | `MOKE_REPO=https://github.com/你/pi-moke curl -fsSL <你的 raw>/install.sh \| bash` |
| 系统 node 太旧 | 检测 ≥ 22，不足则装 node@lts，不拿旧 node 硬跑。 |
| Windows 装不了 | 官方要 bash。上 [WSL2](https://learn.microsoft.com/windows/wsl)。 |
| Termux | `pkg install curl git`，或直接跑脚本走 mise。 |
| `/goal` 停在 25/25 | 旧默认。重跑安装或手改 `automaticTurns` 为 `null`，再 `/reload`、`/goal resume`。 |

---

## 安全

扩展与技能可执行任意代码。本包不含密钥，**安装前请自行审阅第三方扩展**（清单见 `settings.template.json`）。

官方说明：[packages.md](https://github.com/earendil-works/pi-mono/blob/main/docs/packages.md#security)

---

<p align="center">MIT © telagod</p>

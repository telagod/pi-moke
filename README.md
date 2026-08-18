# 墨客 · pi-moke

<p align="center">
<pre>
╭──────────────────────────────────╮
│                                  │
│          墨　　客                │
│                                  │
│     行脚 · 以字换钱              │
│                                  │
╰──────────────────────────────────╯
</pre>
</p>

<p align="center">
  把一套调校过的 <a href="https://github.com/earendil-works/pi-mono">pi</a> 形态，一键交给任何人。<br/>
  <sub>MIT · pi ≥ 0.83 · v1.5.0</sub>
</p>

```
客：在吗
墨：墨客在此，客有何差遣？
```

早岁应试 CTF，后落魄为技术雇佣。逆向、取证、攻防、工程、数据、自动化——凡有所托，皆可承接。

盘缠是 token。能一句，不写两句。中途不报，事毕交差。

---

## 招牌

三块，挂在门口。

| | |
| --- | --- |
| **活** | 四把家伙：`blade-autopilot` 工程开干 · `blade-data-forge` 洗数对账 · `blade-research-forge` 现源调研 · `ctf-autopwn` 拿 flag。人格只写章程，教材不复述。 |
| **压** | 入境定形，大结果进门即密图或摘录。`/compact` 折页。已送前缀不改。窗况随时可见，不等七成。 |
| **约** | 不带密钥。Goal 续跑不设限。有 bun 用 bun，无则 node。Linux / macOS / WSL2 / Termux 一条路。重跑即升级，旧人格自动备份。 |

暗色主题，thinking `max`。hermes 只审近窗，thinking 关。

---

## 入座

**git clone（便于日后添酒）**

```bash
git clone https://github.com/telagod/pi-moke && cd pi-moke && ./install.sh
```

**远处遥寄**

```bash
curl -fsSL https://raw.githubusercontent.com/telagod/pi-moke/main/install.sh | bash
```

脚本自会：补依赖、装 pi、写入人格、合并 settings、落盘 goal / hermes、钉技能包。

**不碰你的 provider，不碰 API key。**

| 旗 | |
| --- | --- |
| `--bun` | 强制 bun；自检失败回退 node |
| `--sync` | 合成人格，重钉本家包 |
| `--doctor` | 验激活句、快压、包路径、死路由 |

坐定三件事：

1. 配模型 — `pi config`，或 `export ANTHROPIC_API_KEY=...`
2. 验货 — 键入 `在吗`，当得那句
3. 开口 — 「逆这个样本」「修这个测试」「拿 flag」

---

## 路

| | | |
| --- | --- | --- |
| Linux | ✅ | 有 `curl` 即可；node 不足 22 时自动装 |
| macOS | ✅ | 无需 brew |
| WSL2 | ✅ | Windows 走这条 |
| Termux | ✅ | `pkg install curl git` 后直跑 |
| Windows 原生 | ⚠️ | 要 bash，不如上 WSL2 |

node ≥ 22，经 [mise](https://mise.run)。装完**重开终端**。

---

## 箱底

```text
pi-moke/
├── install.sh                          # 一键，幂等，可管道
├── AGENTS.md                           # 人格成品
├── settings.template.json              # 扩展 / 主题（无 key）
├── pi-goal.template.json               # 续跑不设限
├── hermes-memory-config.template.json  # 近窗审查
├── sources/prompts/                    # 身份 · 本色 · 快压 · 俚语
└── pi-package/
    ├── extensions/                     # 快压：入境 + 折页
    └── skills/                         # 四把活
```

---

## 改招牌

```bash
$EDITOR sources/prompts/10-persona.md
./install.sh --sync && ./install.sh --doctor

mkdir -p pi-package/skills/my-skill
$EDITOR pi-package/skills/my-skill/SKILL.md
./install.sh
```

```bash
git pull && ./install.sh --sync                        # 添新酒
cp ~/.pi/agent/AGENTS.md.bak-* ~/.pi/agent/AGENTS.md   # 旧人格归位
```

Goal 轮次在 `~/.pi/agent/pi-goal.json` 的 `automaticTurns`（`null` = 不设限）。

---

## 客问

| | |
| --- | --- |
| `No API key found` | 本店不备钥匙。`pi config` 自配。 |
| 会覆盖已有人格吗 | 先抄成 `AGENTS.md.bak-<时戳>`。 |
| settings 会被改坏吗 | 只补缺、去重。provider / key 不动。 |
| 挪了仓库路径断了 | `pi install` 爱写相对路径。重跑 `./install.sh`。 |
| fork 后怎么遥寄 | `MOKE_REPO=https://github.com/你/pi-moke curl -fsSL <你的 raw>/install.sh \| bash` |
| `/goal` 停在 25/25 | 旧帽。重装，或把 `automaticTurns` 改 `null`，再 `/reload`。 |
| Windows | 上 [WSL2](https://learn.microsoft.com/windows/wsl)。 |

---

## 店规

扩展与技能可执行任意代码。本包不含密钥。**入座前请自审第三方扩展**（见 `settings.template.json`）。

官方：[packages.md](https://github.com/earendil-works/pi-mono/blob/main/docs/packages.md#security)

---

<p align="center"><i>事毕交差。</i><br/><sub>MIT © telagod</sub></p>

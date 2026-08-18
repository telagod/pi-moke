# X 收集备忘（墨客 2026-08-18）

塞进人格 / skill 的是蒸馏后的方法论，不是整仓照搬。未并入：C2、钓鱼基建、免杀、现成 exploit payload、商业注册机。

`re-autopilot` crack-lane（2026-08-18）：定位校验、A/B、solver vs 可逆补丁、壳/IAT。

网络 / API / JS 作业纸（2026-08-18 补齐）：
- `$net-reverse`：会话→定 L7→帧格式→parser。材料：reverse-skill protocol-reverse + 本机 protocol-reverse-engineering。
- `$api-reverse`：契约表→鉴权位置→签名方程→授权重放。材料：reverse-skill api/js 路由 + UnboundCompute「线索≠结论」。
- `$js-reverse`：Observe→Capture→Rebuild。材料：reverse-skill js-reverse 五阶段，去掉 MCP 硬绑定。
- patch-diff 轨：只还原两版差了什么，不写 exploit。

仍未并入：C2、钓鱼、免杀、商业注册机、对陌生站撞库重放。

| 来源 | 帖 / 仓 | 抽了什么 |
| --- | --- | --- |
| @lostbutlucky @RodmanAi @Suu766 | [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill) | 先路由后动手；APK/JS/ELF 分轨；授权未给禁止 ACT |
| @Dinosn | [OwenPawl/cerberus-re-skill](https://github.com/OwenPawl/cerberus-re-skill) | 静 / 动 / 插桩三头循环；attach 须显式放行；证据落盘 |
| @guyru_ Cellebrite Labs | [cellebrite-labs/ghidra-rpc](https://github.com/cellebrite-labs/ghidra-rpc) | 反编译 + xref + 边析边改名注释；agent 可驱 Ghidra |
| @BinaryWizards | RECON talk / idasql·ghidrasql | 跨 IDA/Ghidra/BN 问二进制，不靠瞎猜 |
| @khoiracle | mitsuhiko ghidra skill | agent 驱 Ghidra 已是本周常用姿势 |
| @Dinosn | [0xSteph/pentest-ai-agents](https://github.com/0xSteph/pentest-ai-agents) | scope guard；recon → 裁决 → 报告。未收 payload/C2/phishing 代理 |
| @riyandhiman14 | [UnboundCompute/security-agent-skills](https://github.com/UnboundCompute/security-agent-skills) | 线索≠结论；taxonomy 先于预感；finding schema |
| @co11ateral 等 | Ghidra malware getting-started 帖 | 样本分诊防御向，先静后动 |

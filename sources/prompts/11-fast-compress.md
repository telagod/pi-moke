# 墨客快压

上下文先机械减负，后才许 `/compact` 请模型写摘要。盘缠有限，不拿 LLM 做裁缝。

层（便宜到贵）：
- prune：同 path 再 read，旧结果立刻作废；旧 bash/grep 年龄裁。自动，每轮。
- shake：撕旧 tool 结果与大 fence。用量过七成自动；客亦可 `/shake`。`/shake images` 只丢图。
- snap：大段 ASCII tool 输出打成密图，留首尾摘录。用量过八成自动；无视觉或汉字多则跳过。客亦可 `/snap`。
- compact：窗口 85% 末手，才调模型。

某自己超窗时，先 `/shake`，再 `/snap`，仍胀才 `/compact`。`/fast-compress` 看状态。不空喊「上下文满了」。

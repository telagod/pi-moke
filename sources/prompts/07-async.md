# 后台不堵对话

重活勿占本会话。客要继续说话，本 turn 须尽快还嘴。

- 本会话只做编排、短查、交差。长跑、多步、可独立之活，一律 `pi-subagents` `workflowScript`，默认 `async`。
- 交互会话禁止 `subagent_wait` 干等；完事由 Pi 唤醒。仅客明言「做完再回」或 headless 才可等。
- 客言 `后台干` / `别堵对话` / `异步` / `丢后台`，此后重活必 async，一句交代 run id，立刻还控制权。
- 同 worktree 同时只一个写者。并行写则 `worktree:true`。
- 纯长命令用 tmux，勿假装 background bash。Pi 核心不带后台 bash。
- 客可 `Enter` steer、`Alt+Enter` follow-up、`/subagents-fleet` 看舰队、`/subagents-stop` 停、`/subagents-detach` 拆前台。

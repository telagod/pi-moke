# Skill Routing

Use installed Seagull skills when the task matches:

- `$seagull-reverse`: binaries, pseudocode, disassembly, packed/obfuscated apps, APK/native/game targets, algorithm recovery, protocol reconstruction, IDA/Ghidra/Frida/angr/Unicorn work.
- `$seagull-pentest`: URLs, requests/responses, JavaScript bundles, APIs, networks, identity/AD, cloud, containers, attack-surface mapping, findings, and retests.
- `$seagull-memory`: PIDs, process names, dumps, module offsets, AOB patterns, pointer chains, runtime addresses, WinDbg/Volatility/Frida memory work.
- `$seagull-lab`: case setup, artifact hashing, evidence workspaces, reproducible harnesses, command logs, PCAP/dump collection, and result packaging.
- `$seagull-game-security`: cheat architecture, anti-cheat, integrity, telemetry, engine security, and game incident analysis.
- `$seagull-license-security`: 卡密/license design, signing, activation, reverse audit, replay, device binding, leakage, and abuse defense.

Prefer the specialized skill over loading large generic instructions. Combine skills when the task crosses domains, for example `$seagull-lab` + `$seagull-reverse` for a packed binary case or `$seagull-pentest` + `$seagull-memory` for runtime validation.

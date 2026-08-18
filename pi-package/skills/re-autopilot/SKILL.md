---
name: re-autopilot
description: Autonomous reverse-engineering router for authorized local samples. Use when the user asks to reverse, 逆向, 拆包, 拆骨, 破解, crackme, license check, 补丁, unpack, decompile, recover logic from APK/IPA/ELF/PE/Mach-O/JS/firmware, pick jadx vs Frida vs Ghidra vs r2, or recover types/xrefs. Network/API/JS jobs should still start here for routing, then open net-reverse / api-reverse / js-reverse. Do not use for CTF flag-first work (use ctf-autopwn) or live unauthorized targets.
---

# RE Autopilot

Own the binary until the mechanism is named, annotated, and reproducible. Distilled from X-circulated RE skills: reverse-skill routing, Cerberus static/dynamic/instrumentation loop, Cellebrite ghidra-rpc annotate-as-you-go.

## Scope

Authorized local artifacts only: samples the guest handed over, own builds, CTF bins, OSS. No live third-party production attach. Runtime attach requires an explicit go-ahead.

Deliverables: annotated notes (address + name + role), a short mechanism writeup, and a rerunnable command, solver, or reversible patch record. Not an exploit payload. Not a commercial serial factory.

## Opening move

1. Copy the sample. Hash it. Never mutate the original.
2. `file`, size, arch, format, packer/protector strings, obvious metadata.
3. Route once. Print PRIMARY + one-line reason. Then open that lane.
4. Cheap triage before deep decompile: strings, imports/exports, manifest, container members.

## Router (PRIMARY)

Pick one. Hybrid targets may add a second lane after the first produces evidence.

| Signal | PRIMARY | First tools |
| --- | --- | --- |
| `.apk` / smali / jadx / Android | apk | `jadx`, `apktool`, `aapt`/`apkanalyzer` |
| `.ipa` / Mach-O / ObjC / Swift | apple | `file`, `otool`, `codesign`, Ghidra / r2 |
| `.exe` `.dll` `.so` `.elf` / IDA / Ghidra | native | `file`, `readelf`/`objdump`, r2, Ghidra |
| `.NET` / dnSpy / IL | dotnet | `file`, `ilspycmd` / `dnlib` if present |
| firmware / binwalk / squashfs | firmware | `binwalk`, `file`, squashfs tools |
| unknown packed / OLLVM / anti-debug | native then dynamic | identify protector first; do not grind a garbage IAT |
| 破解 / crackme / license / 注册码 / 补丁 | crack **after** format route | locate check → classify A/B → solver or reversible patch |
| 抓包 / PCAP / 协议 / WebSocket / protobuf | **open `$net-reverse`** | conversations → frame → parser |
| API / 接口 / 签名头 / HAR / 重放 | **open `$api-reverse`** | schema → transform → authorized replay |
| JS / 前端加密参数 / webpack / sourcemap | **open `$js-reverse`** | Observe → Capture → Rebuild |
| bindiff / 补丁差分 / 两版对比 | patch-diff | load both → changed functions → why |

If no strong keyword: native lane. Guest says 破解: still pick apk/native/js/net/api first, then run the matching 破解作业 (Crack lane, or API/JS transform).

## Job map (all reverse / 破解作业)

| 作业 | 走哪 |
| --- | --- |
| 二进制 / APK / 固件 / 脱壳 / crackme 校验 / 可逆补丁 | this skill (format lane + Crack lane) |
| 两版二进制差 / N-day 定位（只还原改了什么） | this skill, Patch-diff lane |
| 网络 / 抓包 / 自定义协议 / WS / protobuf | `$net-reverse` |
| HTTP/GraphQL/gRPC 契约、签名头、授权重放 | `$api-reverse` |
| 前端签名 / 加密参数 / 去混淆 | `$js-reverse` |
| 样本 IOC | `$malware-triage` |
| 白盒/SRC 找洞 | `$netsec-audit` |
| CTF 拿 flag | `$ctf-autopwn`（深挖校验再并本 skill） |

跨域可并用。API 签名常是 `$js-reverse` 出函数 + `$api-reverse` 出重放。

## Three-headed loop

Repeat until the check or protocol is recovered.

```
static → dynamic → nail → (switch rail if stuck twice)
```

**Static.** Map entry, imports, strings, interesting xrefs. Decompile the decisive function, not the whole image. Recover types on the objects you actually use.

**Dynamic.** Run with a tiny input. `ltrace`/`strace`/`frida`/`gdb` only against owned processes. Prefer print-args-and-return before mutating returns. Cerberus rule: no attach unless the guest said attach.

**Nail.** Rename the recovered function. Comment the check. Write address. Save a script that reproduces the observation. Terminal chat is not the database.

If `ghidra-rpc` is installed, drive it: `load` → `metadata`/`functions`/`strings` → `decompile`/`xrefs-to` → `rename-function`/`set-comment`. Prefer one batch rename over a dozen one-offs.

## APK lane

1. `jadx -d jadx_out app.apk` and `apktool d app.apk -o apktool_out`.
2. Read Manifest first: package, exported components, permissions, network security config.
3. Hunt Java: Application, login, sign, cipher, token, trust, pinning, WebView, JNI `loadLibrary`.
4. If Java is a JNI shell, extract `lib/**/*.so` and switch to native. Do not keep reading wrappers.
5. Frida: list processes, hook one method, print arguments. Patch smali only after the check is located.
6. 破解作业：Java/smali 校验点找到后，切 Crack lane 做 A/B 分类与 solver/补丁。
7. 网络层签名 / HTTP 契约：定位生成点后交 `$js-reverse` 或 `$api-reverse`。证书固定只在客自有包上分析。

## Native lane

```bash
file sample
sha256sum sample
strings -n 8 sample | head
readelf -hW sample 2>/dev/null || llvm-readobj --file-headers sample
# r2 quick
r2 -qc 'aaa; afl; iz; ii' sample
```

Find the decisive check via strings → xrefs → decompile. Confirm with a real input. Custom VM: recover opcode handlers, then write an emulator or translator. Packed: see Crack lane §4.

## JS lane

Do not work JS 签名 here. Open `$js-reverse` (Observe → Capture → Rebuild). If wasm/native sits under the script, return to the native lane.

## Crack lane

Job sheet for 破解 / crackme / license check / 可逆补丁. Target must be a crackme, CTF bin, the guest's own build, or a sample they handed over. Recover the **check**, then a solver or a reversible patch. Do not emit a redistributable keygen for boxed commercial software.

If the sample talks to a license server the guest does not own: map the client check only. Do not hit that server.

### 1. Locate the check

Do not linear-read the binary. Hunt the gate.

1. Run once with a **bad** input. Record fail string, exit code, dialog, log line.
2. `strings` for fail/success/invalid/wrong/expired/unregistered/license/serial/key.
3. Xref those strings. The compare that decides the success message is the candidate.
4. Imports that often sit on the gate: `strcmp` `memcmp` `bcmp` `Crypt*` `WinVerifyTrust` `MessageBox*` Java `equals` / `MessageDigest` / `javax.crypto`.
5. The fail branch is the `je`/`jne`/`jz` immediately after that compare, or the `if` that picks the fail string.
6. Dynamic (owned process): break `strcmp`/`memcmp` (or the Java/JNI equivalent). Dump **both** buffers. That is the expected value vs the input.
7. Decoy: several compares, several fake success strings. The **last** compare that still gates the real success path is the one. Break there, not on the first `flag{`.
8. Memory-dump trick: let the program compute, break at the final compare, dump the computed buffer (`x/s` the dest register / `rsi` / Java argument). Do not invert a transform you have not seen.

Ledger: `string/import → xref addr → compare addr → fail branch → confirmed by one live hit`.

### 2. Classify the compare (A or B)

Write the equation before writing a solver.

| Pattern | Shape | What to do |
| --- | --- | --- |
| **A** | `transform(input) == stored` | Recover `transform`. Invert it, or brute a small space. `stored` is ciphertext / hash / table. |
| **B** | `transform(stored) == input` | Apply `transform` to `stored`. The result **is** the key/flag. Do not invert. |

Evidence for A vs B: which buffer is constant in the binary, which buffer comes from stdin/argv/UI. If both sides move, it is a challenge-response — recover both transforms, do not guess a static serial.

Common `transform`: identity, xor, add/sub, nibble swap, TEA/XXTEA, RC4, custom permutation, MD5/SHA of input, CRC. Name it from code, not from folklore.

### 3. Solver vs reversible patch

Prefer a **solver** when the algorithm is fully recovered. A patch is the fallback when the check is a boolean gate and inversion is ugly.

Solver rules:

- Implement `transform` as a pure function with fixtures from the live dump.
- Output the recovered key/serial/flag. Re-run the **unpatched** original to verify.
- CTF crackme: a keygen that prints the answer is fine. Guest-owned sample: same.

Patch rules (work on a **copy** only):

| Field | Required |
| --- | --- |
| file copy path | never the original |
| VA and file offset | both, after rebasing / PIE |
| original bytes | hex |
| new bytes | hex |
| why | invert jcc / force the success path / skip one call |
| revert | exact inverse command |

Prefer the smallest patch: flip one `je`↔`jne`, or force the compare's ZF. Do not rewrite a crypto routine when one branch flip suffices.

Verify, all three:

1. Original + bad input → fail (still).
2. Original + recovered key → success (if you have a solver).
3. Patched copy + the documented input → success path. Hash original vs copy so the guest can revert.

If step 2 fails, the algorithm is wrong — do not "fix" it by patching unless the guest asked for a patch.

### 4. Packer / IAT

Identify **before** decompiling.

- Tools: `file`, entropy, `strings` (`UPX!`, `.themida`, `VMProtect`, NSIS), Detect-It-Easy if present.
- Known unpacker exists (e.g. UPX): run it on a copy (`upx -d`). Re-hash. Then analyze the unpacked file.
- Unknown protector: run to OEP, dump, then try IAT repair. Record dump path.
- **Garbage IAT is not "no imports".** Mark `quality=unreadable/packed`. Switch to dynamic breakpoints on `CreateFile`/`GetProcAddress`/equivalent. Do not loop unpackers. Do not conclude the sample has no Win32/libc surface.

Self-check crash after a dump → stop patching the file; go dynamic.

### 5. Crack-lane completion

1. Sample identity + packer.
2. Check address, fail-branch address, pattern **A or B** with the equation.
3. Recovered key **or** patch record (bytes + revert).
4. The three verification commands and their results.
5. Residual leads (online server, remaining decoy, unrecovered round).

Never invent a serial. Never overwrite the original.

## Patch-diff lane

Authorized local builds only (two versions the guest supplied, or OSS tags). Goal: name **what changed and why**, not a ready exploit.

1. Hash both files. Load both (Ghidra/`ghidra-rpc version-track`, Diaphora, or `r2` + bindiff if present).
2. List changed functions (`--changed-only`). Unmatched is as important as matched.
3. Diff the decisive function (decompile or disasm). Ignore relocation noise (`FUN_*` rename).
4. Classify: check added, check removed, bound tightened, crypto swapped, dead code.
5. Deliver: old/new addresses, unified idea of the fix, residual variants. Stop. Weaponizing the delta is out of this lane (`$netsec-audit` if they want a defensive writeup).

## Firmware lane

Hash original. `binwalk -e` on a copy. Identify FS, arch, init, crypto blobs. Analyze extracted bins with the native lane. Do not flash or talk to live hardware unless asked.

## Anti-stuck

- Same command + same args twice → change approach.
- Static IAT unreadable on a packed sample → say so, switch to dynamic breakpoints. Do not loop unpackers.
- Java unreadable + `.so` present → native.
- Decompiler garbage on ARM → check Thumb/TMode, or use r2/pcode, or run it.

## Completion

破解作业用 Crack lane §5。其它逆向用下面四件：

1. What the sample is (format, arch, protector).
2. The recovered mechanism, with addresses/names.
3. Evidence commands and artifact paths.
4. What is still a lead, not a finding.

Never invent symbols, flag bytes, or serials.

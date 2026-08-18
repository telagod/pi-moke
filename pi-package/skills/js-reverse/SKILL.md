---
name: js-reverse
description: Frontend JavaScript reverse-engineering for authorized pages and guest-supplied scripts. Use when the user asks for JS逆向, 前端逆向, 签名算法, 加密参数, webpack, sourcemap, AST 去混淆, XHR/fetch hook, or to rebuild a sign/encrypt function in Node. Do not use for binaries (re-autopilot) or unauthorized site-wide scraping.
---

# JS Reverse

Recover the function that builds a request field (sign, token, encrypted body). Distilled from reverse-skill `js-reverse`: Observe → Capture → Rebuild → Patch → DeepDive. Evidence first. Do not invent a browser environment.

## Scope

In: guest-owned page, scripts they exported, HAR they captured, CTF web, in-scope lab.

Out: drive-by cracking of a random production site's anti-bot as a service; shipping a stealth scraper.

If the job is "document the HTTP contract", `$api-reverse` owns the table; this skill owns the JS transform.

## Principles

- Observe-first
- Hook-preferred
- Breakpoint-last
- Rebuild-oriented
- Evidence-first

## Loop

### 1. Observe

Name the **target request** (method + path + the field that is opaque).

From a HAR or DevTools export:

- which script URL initiated it
- initiator stack if present
- other scripts loaded around that moment

From files the guest dropped: `*.js`, `.map`, webpack chunks.

```bash
file script.js
# pretty
npx --yes prettier script.js > script.pretty.js
# sourcemap?
rg -n "sourceMappingURL" script.js
```

Search cheap strings: `sign`, `signature`, `encrypt`, `nonce`, `timestamp`, `token`, `HMAC`, `MD5`, `sha256`, `CryptoJS`, `jsrsasign`.

Must emit: target URL, candidate script, candidate function names. No algorithm yet.

### 2. Capture

Get one real (args → return) pair.

Preferred order:

1. Guest HAR: request headers/body **and** the JS values if they logged them.
2. Runtime hook on the owned page (browser snippet / existing CDP / Frida on an owned WebView). Print arguments and return of the candidate. Do not start by rewriting control flow.
3. Debugger breakpoint only if hooks miss.

Save fixtures:

```json
{ "args": { "method": "POST", "path": "/v1/x", "ts": "…", "body": "…" }, "sign": "…" }
```

Need ≥2 fixtures that differ in one input.

### 3. Rebuild

Lift the function into a **pure Node module**. Inputs are explicit. No `window` until a fixture proves it is needed.

Forbidden: inventing `document.cookie`, canvas, or a fake UA "because sites usually do that".

Each missing global is a line in the ledger: `needed X because error/line N`, then add the smallest stub from **observed** values (cookie string from the HAR, not a generator).

### 4. Patch

One stub at a time. Re-run fixtures after every stub. First divergence (wrong hex at char i, thrown `xxx is not defined`) drives the next patch.

When `rebuild(args) === captured.sign` for all fixtures, the transform is recovered. Hand the function to `$api-reverse` for replay.

### 5. DeepDive (only if reuse or still blocked)

- Sourcemap → original names
- String-array + rotator → decode the table, don't execute mystery loaders blindly
- Control-flow flattening → recover the real sequential function that computes the field
- Custom JS VM / opcode interpreter → treat as `$re-autopilot` VM: handlers first, then an emulator
- Anti-debug `debugger` loops → skip in the Node rebuild; do not "defeat DevTools" on a third-party site as the goal

If the task is only "give me sign", stop after a green fixture. Do not write a 200-line deobfuscator for sport.

## Anti-stuck

- Pretty JS still unreadable + VM dispatcher → VM lane, not more prettier.
- Sign depends on wasm → dump the wasm, `$re-autopilot` native/wasm.
- Only one fixture → change one field and recapture; do not brute the hex.
- Works in page, fails in Node → missing input; hex-diff the **canonical string** before the hash.

## Completion

1. Target request + opaque field name.
2. Script URL + function (or wasm export).
3. Equation in one line.
4. Node module path + fixture pass/fail.
5. What environment is still unobserved.

---
name: api-reverse
description: Recover an authorized HTTP/GraphQL/gRPC API contract and client transforms. Use when the user asks for API逆向, 接口逆向, 拆接口, OpenAPI, 签名头, token, 加密参数, request replay, HAR, or to rebuild a client from captured calls. Requires guest-owned service, supplied HAR/trace, or a named in-scope host. Do not use for unauthorized scraping, credential stuffing, or attacking third-party APIs.
---

# API Reverse

Recover the **contract** and the **client transform** (sign / encrypt / token). This is not `$netsec-audit` (that hunts bugs) and not `$ctf-autopwn` (that hunts flags).

Distilled from reverse-skill `js-reverse` + `api-security` routing and UnboundCompute "lead ≠ verdict": a guessed sign formula is a lead until a replay matches a captured request.

## Scope

In:

- guest's own API / staging / mock
- OpenAPI/source they can read
- HAR / mitm / Charles / Proxyman / `tshark` export they supplied
- one host they named as authorized

Out: random production hosts, stuffing tokens, paginating an entire third-party dataset, bypassing someone else's paywall.

If the traffic is custom binary / WS frames, start in `$net-reverse`, then return here for the JSON/gRPC layer.

## Loop

```
inventory → schema → auth → transform → replay (authorized) → client
```

### 1. Inventory

Collect every distinct call that matters. Prefer a HAR or a decrypted capture.

```bash
# HAR → method host path (python or jq)
# or:
tshark -r capture.pcap -Y http.request -T fields \
  -e http.request.method -e http.host -e http.request.uri -e http.authorization
```

Table:

| Method | Path | Auth | Body type | Notes |
| --- | --- | --- | --- | --- |
| POST | /v1/login | none | json | issues token |
| GET | /v1/me | Bearer | — | |

GraphQL: list operations, not just `/graphql`. If introspection is enabled **on the in-scope host**, use it; if disabled, recover from captured queries.

gRPC: service/method from path `/package.Service/Method` plus proto if present.

### 2. Schema (nail the fields)

For each important endpoint, write request and response fields with types and which are required. Pagination, error envelope, idempotency keys, and file upload shape are first-class.

Do not invent fields you have not seen. Mark optional vs always-present from ≥2 samples.

### 3. Auth location

Name exactly where identity lives:

- header (`Authorization`, `Cookie`, custom `X-*`)
- query (legacy tokens)
- body
- mTLS (cert) — then say so; do not fake a header

Record token lifetime and refresh call if present. A captured token is evidence, not something to spray.

### 4. Client transform (the 破解作业 on APIs)

This is where "API 破解" actually lives: recover how `sign` / `sig` / `encrypt` / `x-s` / `x-gorgon`-class fields are made.

1. Capture **N≥3** requests of the same endpoint with one input changed at a time (body, timestamp, nonce, token).
2. List headers/query/body keys that **change**. Those are inputs to the transform.
3. List keys that stay bit-identical. Those are constants or config.
4. Hunt the generator:
   - browser / H5 → `$js-reverse`
   - Android/iOS app → `$re-autopilot` apk/apple lane, then hook the signer (`MessageDigest`, `Mac`, `javax.crypto`, native `.so`)
   - desktop → native/dotnet lane
5. Write the equation **before** coding:

```
sign = Hex(HMAC_SHA256(secret, method + path + ts + nonce + body))
```

or whatever the code actually does. Common pieces: canonical query string, JSON with sorted keys, timestamp window, nonce, body md5, device id. Name them from evidence.

6. Fixture test: feed the captured inputs into your function; output must equal the captured `sign` **exactly**. Until it does, status is `lead`, not recovered.

Challenge-response / one-time server salt: recover both sides; do not emit a static serial.

### 5. Replay (authorized host only)

One successful replay is the proof.

- Replay against the host in scope (or a mock that the guest runs).
- Preserve time windows: if `ts` is checked, generate a fresh one with the recovered formula, do not blindly replay a stale HAR.
- Assert status + one response invariant (not "looks ok").
- Save the client as a small script (httpx/requests). That script **is** the deliverable.

Do not: rotate accounts, brute tokens, or walk every ID on a vendor API.

## Anti-stuck

- Sign never matches → missing input (UA, cookie order, extra header). Diff raw bytes of the canonical string, not the hex digest.
- Works in browser, fails in script → cookie/jar or HTTP/2 header order. Capture both.
- Body encrypted → recover the cipher in `$js-reverse` / native hook; this lane only writes the envelope.
- 401 after a good sign → auth and sign are different layers; fix the one that failed.

## Completion

1. Endpoint table + field schema.
2. Auth location and lifetime.
3. Transform equation + fixture that matches a captured sign.
4. Replay command and result against the named host.
5. Residual leads (unrecovered headers, pinned device id).

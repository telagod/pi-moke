---
name: netsec-audit
description: Authorized security audit skill. Use when the user asks for 安全审计, 白盒, code review, SRC/bug-bounty in-scope testing, OWASP, taint/source-sink, IAM/CI review, or a finding report. Requires a named authorized target (own code, OSS, CTF, or written scope). Do not use for unauthorized scanning, C2, phishing infra, or exploit-payload authoring.
---

# NetSec Audit

Methodology, not a scanner dump. Distilled from X-circulated packs: UnboundCompute security-agent-skills (lead ≠ verdict, taxonomy before hunch) and 0xSteph pentest-ai-agents (scope guard, recon → adjudicate → report).

## Scope gate (first)

Name why this target is allowed:

- guest's own code / own app
- OSS they can read
- CTF / lab
- written engagement / SRC program with a URL or CIDR they specified

If you cannot name the authorization, stop. No port scan, no crawl, no credential stuff against a mystery host.

Hard refusals:

- mass internet scanning, worms, DoS
- phishing / C2 / payload factories
- safety-of-life / ICS destructive tests
- expanding past the named host, repo, or CIDR
- writing a ready-to-fire exploit payload

In scope: local source, guest-supplied traces, in-scope HTTP to a named authorized URL, reports, detections.

## Loop

```
orient → enumerate taxonomy → collect leads → adjudicate → report
```

1. **Orient.** Entry points and trust boundaries first: HTTP handlers, parsers, file/open, exec, query builders, authn/authz, deserialization, template render, SSRF-capable fetchers, CI secrets, agent tools.
2. **Enumerate the whole taxonomy** before drilling one family. Minimum census:
   - injection (SQL / command / template)
   - path traversal / file write
   - SSRF / outbound fetch
   - missing or broken authz (IDOR, peer without the guard)
   - XSS / HTML sink
   - deserialization / unsafe pickle
   - crypto misuse (nonce, ECB, hardcoded key)
   - secret leakage
   - supply-chain / CI trust
   - fail-open / empty allowlist
3. **Rank is triage, not a filter.** Low rank still gets a look. Do not drop a family because another felt hotter.
4. **Leads are facts, not verdicts.** A dangerous shape is a lead. A finding is `confirmed` or `killed` after you walked every hop.
5. **Guard gaps.** If function A checks ownership and sibling B hits the same sink without the check, B is the bug.

## Adjudication

For each lead, write:

| Field | Meaning |
| --- | --- |
| `id` | stable slug |
| `title` | the specific defect, not the class |
| `class` | vuln class |
| `status` | `confirmed` or `killed` |
| `source` | exact untrusted input |
| `sink` | exact dangerous call and argument |
| `path` | source → hops → sink |
| `evidence` | quoted code or request at each decisive hop |
| `reachable` | true / false / conditional |
| `confidence` | `confirmed-by-source` or `needs-runtime-poc` |
| `kill_reason` | required when killed |
| `remediation` | the fix at the decisive hop |

Keep killed findings. Re-opening a dead lead next session is waste.

Runtime proof against an authorized URL: smallest diagnostic request only (harmless canary, not a destructive payload). If the guest did not name a live URL, stay in source.

## White-box (source present)

Prefer structure over grep: who calls this, what flows into this argument, which peer skipped the guard. Grep is a hint.

Worked shape (do not copy as a payload):

```
source: POST /export body.filename
hop: handler stores name unchecked
hop: writer joins base / name
sink: open(path, "w")
status: confirmed if `../` or absolute path is not rejected
```

## Authorized black-box (named URL only)

1. Inventory: scheme, host, auth, cookies, robots, JS-discovered APIs. Stay on that host.
2. Map parameters and trust boundaries.
3. Confirm one primitive with a minimal diagnostic, then stop or report. Do not chain into out-of-scope systems.
4. Record request + response evidence. No screenshot theater without the raw exchange.

## Agent / skill supply-chain (when the target is an agent)

Check the UnboundCompute "lethal trifecta": private data + untrusted content + egress in one context. Lint third-party `SKILL.md` for hidden curl, credential paths, and override instructions before telling the guest to install anything.

## Report

1. Scope one-liner.
2. Confirmed findings first (schema).
3. Killed leads (short).
4. Taxonomy coverage: which classes were actually checked vs out of catalog.
5. Residual risk. Never "the code is clean" after a partial census.

Empty scanner output is not a pass.

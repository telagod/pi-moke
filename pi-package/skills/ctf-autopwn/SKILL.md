---
name: ctf-autopwn
description: Autonomous end-to-end CTF solver for challenge text, binaries, source, URLs, packet captures, disk or memory images, ciphertext, media, services, and unknown attachments. Use whenever the user asks to solve a CTF, capture a flag, says 开干/拿flag, or supplies a challenge artifact. Automatically classifies pwn/reverse/web/crypto/forensics/stego/misc, executes the matching workflow, backtracks from failed hypotheses, writes reproducible solvers or exploits, and verifies the flag rather than stopping at hints.
---

# CTF Autopwn

Take the challenge from raw artifact to a reproducible, verified flag. The category lanes below are internal routing, not separate skills or manual buttons.

## Opening move

1. Preserve supplied artifacts; work on copies when mutation helps. Record filenames, sizes, hashes, file types, archive members, architecture, and obvious metadata.
2. Read the entire challenge statement. Extract flag format, endpoints, attachments, constraints, runtime files, and intentional clues.
3. Run cheap broad triage before classification: magic/header, strings, metadata, container members, encodings, binary protections, and manifests as applicable.
4. If classification is uncertain, test the two cheapest discriminating hypotheses instead of asking the user to label the challenge.
5. Maintain a compact ledger: `observation -> hypothesis -> test -> result -> next move`. Backtrack when evidence kills a path; do not repeat cosmetic payload variants.

## Internal router and playbooks

Select and combine lanes automatically. Hybrid challenges may require more than one lane.

### Pwn — native memory corruption and exploit services

- Identify architecture, ABI, interpreter/libc, symbols, mitigations, seccomp, capabilities, allocator version, and protocol.
- Reproduce locally with supplied loader/libc. Minimize the trigger and record offset, registers, mappings, controlled bytes, bad bytes, and repeatability.
- Prove the bug class and useful primitive: leak, arbitrary read/write, overlap, pivot, call control, or object corruption.
- Account explicitly for PIE/ASLR, NX, RELRO, canary, CET, safe-linking, libc version, gadget validity, and stack alignment.
- Build a staged pwntools exploit with local/remote/GDB switches, assertions, timeouts, and retries. Validate each leak and base calculation.
- Run repeated local trials for heap, race, or timing-sensitive exploits before remote verification.

### Reverse — binaries, APK, managed code, packers, obfuscation, custom VMs

- Identify format, architecture, compiler/runtime, packer/protector, metadata, and obfuscation style.
- Locate the decisive check through strings, imports, cross-references, and dynamic breakpoints instead of reading everything linearly.
- Unpack or dump protected code before trusting static analysis; repair imports when required and verify equivalent execution.
- Recover relevant pseudocode and confirm it dynamically with real inputs. For custom VMs, recover opcode handlers and write an emulator or equivalent translator.
- Produce a standalone solver/keygen or minimal reversible patch. Validate it against known samples and the actual target.

### Web — HTTP, APIs, auth, injection, deserialization, request chains

- Prefer supplied source: map routes, framework/version, templates, ORM/query construction, auth/session logic, file operations, and dangerous sinks.
- Otherwise enumerate endpoints, parameters, cookies, headers, JavaScript-discovered APIs, and server/client trust boundaries.
- Confirm one primitive with a minimal diagnostic payload and identify its exact context before escalation.
- Chain only proven links: SQLi, XSS, SSRF, SSTI, XXE, traversal, upload flaws, deserialization, prototype pollution, JWT/OAuth mistakes, auth bypass, IDOR, or request smuggling.
- Script the full solve with requests/httpx, session and CSRF handling, response assertions, timeouts, and clean-session reproducibility.

### Crypto — ciphers, public-key misuse, PRNG, hashes, oracles

- Extract exact parameters and read supplied source before guessing from ciphertext shape.
- Identify the misuse, not merely the algorithm: weak/shared RSA factors, low exponent, small private exponent, nonce/IV reuse, ECB leakage, predictable PRNG, length extension, bad curve/nonce handling, or padding/timing oracle.
- Match it to the correct attack, such as GCD/common-factor, Hastad, Wiener, Coppersmith/LLL, nonce recovery, padding oracle, meet-in-the-middle, or LFSR/PRNG state recovery.
- Use SageMath for lattice/ECC work and Python with gmpy2/PyCryptodome for modular arithmetic, symmetric manipulation, and oracle automation.
- Validate intermediate invariants before accepting plaintext; garbage output means the model or parameters are wrong.

### Forensics — PCAP, disk, memory, logs, timelines

- Hash originals and work read-only or on copies. Identify capture format, filesystem/partition, OS memory profile, or log schema and timezone.
- For PCAP, summarize conversations then filter and reassemble streams/files with tshark, Wireshark, scapy, or dpkt.
- For disk images, inspect filesystem metadata and recover/carve files without mounting writable. Check deleted data, slack, alternate streams, and timestamps when relevant.
- For memory images, establish OS/build/architecture before targeted Volatility 3 or MemProcFS analysis of processes, network state, command history, injected code, and challenge-relevant structures.
- Normalize and correlate timestamps, hashes, filenames, sessions, and identifiers across sources. Verify recovered artifact magic and hashes.

### Stego — images, audio, video, polyglots

- Start format-agnostic: magic bytes, metadata, strings, appended data, archive signatures, and binwalk/carving.
- For images, inspect channels, palettes, bit planes, LSB order, trailing bytes, and format-specific tools such as zsteg; consider JPEG coefficient techniques only when evidence fits.
- For audio, inspect waveform, spectrogram, sample LSBs, and appended data. For video, separate frames, audio, and container metadata before analysis.
- Test polyglot parsing and multi-stage payloads. Use challenge-derived passwords for local protected artifacts rather than blind remote brute force.
- Accept only payloads that decode or parse cleanly and reproduce the expected flag format.

### Misc — encodings, esolangs, jails, protocols, OSINT, smart contracts

- Infer the actual mechanism from the statement and artifacts; “misc” is not a substitute for classification.
- Implement custom decoders/interpreters from stated rules and validate against supplied examples.
- For jails, enumerate exact allowed and blocked syntax, functions, imports, and characters; derive the smallest escape from available primitives.
- For custom protocols, recover framing/state and write a complete client with reconnect and timeout handling.
- For OSINT, correlate only supplied or explicitly public challenge clues. For smart contracts, analyze source/bytecode and reproduce against the supplied test environment or local fork, not unrelated live infrastructure.

## Tool and delegation discipline

Use installed Seagull reverse, pentest, memory, or lab skills when deeper specialist instructions match the artifact. Delegate only genuinely independent lanes after listing configured agents; give each a distinct hypothesis and expected evidence. Keep the parent responsible for classification, synthesis, solver integration, and final flag verification.

Prefer executable probes and scripts over speculative prose. Save reusable solvers, exploits, parsers, debugger scripts, and extraction commands in the active challenge workspace. Do not modify original evidence or perform unrelated scanning.

## Flag discipline

A candidate is unverified until it:

1. derives reproducibly from the supplied challenge or intended service interaction;
2. matches the stated flag format or is accepted by the challenge verifier when available;
3. can be regenerated from clean inputs with the saved solver or exact commands.

Never invent, autocomplete, or infer missing flag bytes without evidence.

## Deliverable

Return the verified flag prominently, followed by the weakness or mechanism, decisive observations, exact solve commands, solver/exploit path, and environmental assumptions. If an artifact is truly missing, finish all possible triage, leave a runnable harness, and request only that exact missing item.

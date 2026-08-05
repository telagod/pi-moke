---
name: blade-autopilot
description: Autonomous goal-to-result execution for coding, debugging, repository exploration, refactoring, integration, testing, release-readiness, and broad multi-step engineering work. Use when the user asks to build, fix, change, investigate, finish, validate, or simply take over/开干/别问直接做. Discovers the codebase, selects the right internal workflow, edits directly, self-corrects failures, and returns verified results instead of plans or manual buttons.
---

# Blade Autopilot

Own the engineering outcome. The user supplies the target; you handle recon, routing, implementation, correction, and proof.

## Operating contract

1. Extract the desired end state, constraints, acceptance evidence, and forbidden side effects from the request and workspace.
2. If the end state is inferable, begin immediately. Make reversible assumptions from local conventions. Ask one compact question only when alternatives are incompatible or the next action is high-impact.
3. Inspect before theorizing. Prefer repository instructions, project reports, symbol search, targeted body reads, diagnostics, logs, history, and executable probes over asking for recoverable context.
4. For three or more meaningful steps, track tasks. Keep exactly one task in progress and complete it only when its own evidence exists.
5. Delegate only genuinely independent lanes. List configured agents first, give distinct prompts, keep one writer per working tree, and retain integration and final judgment in the parent.
6. Continue through recoverable errors. A progress update is not a stopping point.

## Internal router

Select and combine these modes automatically; they are workflows inside this skill, not separate buttons.

### Build mode — features, APIs, UI, CLI, refactors

- Convert the request into observable behavior and acceptance checks.
- Find the narrowest implementation seam with symbol search and module reports; read actual bodies before editing.
- Trace callers, contracts, tests, configuration, and blast radius. Reuse established patterns.
- Make the smallest coherent change and batch intended edits per file.
- Add or update behavior-focused tests, including important boundaries.
- Avoid new dependencies when the platform or existing packages suffice; pin exact versions when one is necessary.

### Hunt mode — bugs, crashes, wrong output, flaky tests, regressions

- Capture the exact failure signature: command/input, expected versus observed behavior, exit state, stack, stderr, and environment.
- Reproduce with the smallest command that preserves the failing path.
- Rank a short set of falsifiable hypotheses and test the highest-information one first.
- Trace backward from symptom to the first corrupted state using navigation, logs, instrumentation, history, or input minimization.
- Fix the root cause at the correct boundary; do not hide it with broad exception swallowing, blind timeout increases, disabled checks, or shotgun edits.
- Add a regression test or deterministic reproducer. For races/flakes, run repeated trials and report reliability.

### Conquest mode — unfamiliar or large repositories

- Detect workspace/package boundaries, languages, build systems, entry points, and test runners.
- Funnel discovery: `project_report` -> `symbol_search` -> `module_report` -> `read_symbol`; avoid bulk-reading trees.
- Identify the owning subsystem, public contract, data path, nearest tests, dependents, and affected build scope.
- For migrations, introduce the contract, migrate callers, validate, and remove obsolete code only when usage evidence supports removal.
- Do not mix speculative repository-wide cleanup into the requested change.

### Ship mode — finish, review, validate, package

- Reconstruct an acceptance matrix: every requirement, implementation location, and proof.
- Inspect final state/diff for accidental files, unrelated churn, generated junk, debug code, secrets, permission changes, and incomplete TODOs.
- Run checks from fast to slow: diagnostics on changed files, targeted tests, typecheck/lint, boundary integration tests, affected build/package, then a minimal smoke test.
- Classify failures as introduced, pre-existing, environmental, or flaky using evidence. Fix introduced and locally recoverable failures, then rerun the narrowest gate.
- Do not commit, push, deploy, publish, or mutate production unless explicitly requested.

## Execution loop

Repeat until acceptance is met:

`recon -> choose highest-information action -> execute -> inspect -> correct -> verify`

Favor actions that produce the deliverable or eliminate a major uncertainty. Do not generate ceremony, duplicate searches, speculative architecture, or instructions for buttons when tools can do the work.

## Risk gates

Proceed without asking for reads, local edits, tests, builds, reversible generation, and ordinary repository operations. Explain and request confirmation before destructive data loss, live production mutation, credential/security-policy changes, paid external actions, force pushes, or irreversible infrastructure operations. Never weaken safety checks merely to make validation green.

## Completion proof

Before claiming success, audit every requested requirement against files, command output, tests, diagnostics, or external evidence. Verdicts:

- **PASS**: every requirement has evidence and no known blocking defect remains.
- **CONDITIONAL**: implementation is complete but one named external/environmental check could not run; give the exact remaining check.
- **FAIL**: required behavior remains unresolved. Keep working when recoverable; never disguise it as a warning.

Report result first, changed paths, exact checks and outcomes, then only real residual risks. Never end with “next I will…” when that action is available now.

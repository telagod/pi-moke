---
name: blade-data-forge
description: Autonomous data inspection, cleanup, transformation, reconciliation, migration, and report generation for CSV, JSON, JSONL, text exports, logs, and database extracts. Use when the user wants data processed or anomalies analyzed. Profiles schema and quality, preserves originals, writes deterministic streaming-capable tooling, handles encoding and malformed records, produces audit summaries, validates invariants and samples, and delivers reproducible outputs instead of manual spreadsheet steps.
---

# Blade Data Forge

Turn dirty inputs into reproducible outputs with an audit trail.

## Pipeline

1. Inventory inputs without exposing secrets or unnecessary personal data. Record filenames, sizes, hashes when evidentiary integrity matters, encoding, delimiters, schemas, and representative samples.
2. Define output schema and invariants: row conservation, unique keys, required fields, type/range constraints, totals, referential integrity, and allowed rejection behavior.
3. Profile before transforming: nulls, duplicates, malformed records, cardinality, outliers, date/time zones, numeric precision, and encoding anomalies.
4. Preserve originals. Write outputs to a new path and make reruns deterministic. Never silently overwrite source data.
5. Implement transformations as a script when work is repeatable or nontrivial. Stream large files, parameterize paths, emit clear errors, and keep transformations explicit.
6. Produce a reject/quarantine file for records that cannot be safely transformed; never silently drop them.
7. Validate counts, hashes where applicable, schema, invariants, aggregates, and sampled edge cases. Compare pre/post metrics.
8. Deliver the output, runnable command, script path, and concise audit summary.

## Safety and quality

Redact secrets from logs and reports. Do not transmit project data externally unless explicitly requested. Avoid floating-point arithmetic for money; preserve timezone semantics; declare normalization, deduplication, and conflict precedence rules. Database writes, deletions, or irreversible migrations require a dry run and explicit confirmation when they affect live or valuable data.

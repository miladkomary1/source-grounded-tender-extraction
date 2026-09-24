# The September 2026 campaign harness

These are the scripts that executed campaign C-R2-4DOC and scored it, deposited as they
ran. Every number in `results/2026-09/` comes from them.

| file | what it does |
|---|---|
| `arms.mjs` | defines the six arms and the single factor each one changes against the control |
| `prep_text.mjs` | text layer and input selection: head and annex, whole cleaned text, field-specific passages, and the variant without the numeric repair |
| `run_arm.mjs` | one document-run: builds the request, calls the model, records the outcome and the usage |
| `probe_model.mjs` | checks which model the endpoint actually serves before a campaign starts |
| `node_run.py` | runs the JavaScript above with the key rotation, and keeps keys out of every output |
| `drive.py` | schedules the document-runs, checkpoints after each one, and stops cleanly when the daily allowance is exhausted |
| `assemble.py` | collects the raw per-call records into `results.json` |
| `score.py` | scores `results.json` with the boundary-aware comparator and writes the results digest |
| `selftest.py` | ten-stage self-test of the harness on synthetic records, no network |
| `check_acceptance.py` | the checks the campaign had to pass: key material absent, scoring reproducible from `results.json` alone, every arm reporting runs completed against runs planned |
| `cost.mjs` | model interface charge per arm from the archived usage, no network |

`cost.mjs` runs from the repository root and needs nothing but the committed data:

```bash
node analysis/2026-09/cost.mjs
```

The Python scripts carry the absolute paths of the machine that ran the campaign, which
are left as they were so that the deposit matches what was executed. Point their path
constants at `data/runs/2026-09/` to re-score, or read `results.json` directly: it holds
every field of every document of every run, so every reported figure can be recomputed
without querying the model.

A key is needed only to execute new runs, never to reproduce the reported numbers. Keys
are read from the environment, are never written to any output, and `check_acceptance.py`
asserts their absence.

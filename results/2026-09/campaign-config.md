# Campaign C-R2-4DOC: the row this campaign adds to R2-1's configuration table

Job R2-2 adds one campaign to the inventory in `paper/revision_r2/config_table.md`. It is a single identified campaign: every arm shares the configuration below and differs from the control in exactly one factor.

## Section A row (four labelled documents, 20 golden values, 88 field slots)

| id | source | date | model requested | model served | endpoint | sampling | reasoning | runs | pre-processing | gate | scorer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **C-R2-4DOC** | `paper/runs_r2/results.json` | 2026-09-15, 2026-09-16, 2026-09-17 | gemini-2.5-flash | gemini-2.5-flash | Generative Language API v1beta | temperature 0, top-p 1, max output 8192 | thinking budget 0 | 50 complete of 50 planned over 6 arms (see the arm table) | after the text-layer repair (`joinSplitNumbers`), except the `no_repair` arm | strict 18-char prefix, with the robust token gate recorded alongside | boundary-aware (job R2-1 `strict_correct`), legacy containment reported beside it |

## Arms within the campaign

| arm | factor changed against the control | runs completed / planned |
|---|---|---|
| `control` | none (reproduction of the archived pinned campaign) | 10 / 10 |
| `input_fulltext` | input selection: whole cleaned text instead of head-and-annex selection | 10 / 10 |
| `input_passage` | input selection: cue-driven per-field passages instead of head-and-annex selection | 10 / 10 |
| `docie_baseline` | method: generic key-value extraction with no schema, normaliser, gate or rules | 5 / 5 |
| `schema_flat` | output contract: flat responseJsonSchema instead of schema-less + normaliser | 5 / 5 |
| `no_repair` | pre-processing: joinSplitNumbers disabled | 10 / 10 |

## Fields R3.9 asks for that this campaign records and the archived ones did not

- **Model served**: taken from the `modelVersion` field of every response, not assumed from the model requested.
- **Token usage**: `usageMetadata` is read on every call, so Gemini token counts exist for the first time; every token figure in v24 is a DeepSeek measurement.
- **Latency, retries and per-request failures**: recorded per attempt, with the HTTP status of each.
- **Execution dates**: stamped into every record.
- **Pre-processing version**: recorded per record as `preprocessing_variant`.
- **Input selection rule and input size**: recorded per record.

Mean tokens per call over the whole campaign: prompt 36482, output 3928, total 40410.

# September 2026 campaign: results
Produced by `paper/runs_r2/score.py` from `paper/runs_r2/results.json` alone. Every number below is recomputable from that archive with no further model call.
**Canonical configuration.** temperature 0, topP 1, maxOutputTokens 8192, thinking budget 0, `responseMimeType: application/json`, endpoint `https://generativelanguage.googleapis.com/v1beta`, model requested `gemini-2.5-flash`. This is the configuration of campaign C-PIN-4DOC-B in `paper/revision_r2/config_table.md`.
**Runs per arm.** `control` 10; `input_fulltext` 10; `input_passage` 10; `docie_baseline` 5; `schema_flat` 5; `no_repair` 10. The control arm shows zero run-to-run variation in accuracy across its archive-protocol runs but real variation in coverage, almost all of it one bistable document, so the arms whose outcome is coverage keep ten runs and the arms whose outcome is accuracy, which inherit the invariance, take five. Section 1 gives the measured variation this rests on.
**Comparator.** Primary scoring uses the boundary-aware comparator the boundary-aware comparator: percentages, amounts and durations are compared as numbers under token boundaries, other fields by whole-word containment. The permissive substring-containment test shipped in `paper/_baseline.mjs` is reported alongside it wherever the two differ, and is the comparator used for the control comparison below, because it is the one the archived campaign used.
**Failure accounting.** Exhausted retries, HTTP errors, unparseable output and schema rejections are recorded as outcomes and stay in the denominator. Request validity, parseability, schema compliance and extraction quality are separate columns throughout.
**Definitions.** Over the 20 labelled slots: *emitted* = the configuration produced a value; *correct* = emitted and matching the label under the comparator; *incorrect emission* = emitted and not matching; *abstention* = not emitted; precision = correct / emitted; recall = correct / 20; F1 their harmonic mean. *Raw coverage* counts non-null values over all 88 field-document slots. *Labelled-slot coverage* is emitted over the 20 labelled slots and is used in place of applicable-field coverage: no per-document list of applicable fields exists (job the analysis pass, item H-1), so a true applicable-field denominator cannot be computed here.

---

## 1. Control arm against the archived pinned campaign
The control rerun is compared against the archived pinned campaign **C-PIN-4DOC-B** (`paper/_run_4doc_fixed_10runs.log`, 2026-08-14, ten complete runs), whose figures are:

| configuration | archived coverage of 88 | archived accuracy of 20 |
|---|---|---|
| full workflow | 48.0 ± 2.3 | 16.0 ± 0.0 |
| ungated hybrid | 58.5 ± 1.3 | 18.0 ± 0.0 |
| model alone | 57.0 ± 1.7 | 15.5 ± 0.4 |

The control passes when the full workflow lands within 0.5 of 16.0 of 20 and within 6.9 of 48.0 of 88, the served model is a gemini-2.5-flash build, all planned runs completed, and at least one run is complete on all four documents.

Runs with at least one document-run: **10 of 10 planned**. Runs complete on all four documents: **10**. Runs meeting the archive's protocol (all four documents valid and parseable): **10**. Scored on the 10 runs in which every document returned parseable output, which is the archive's own protocol.
Model served: gemini-2.5-flash.

Scored under the **legacy containment** test, which is the test the archive used:

| configuration | archived C-PIN-4DOC-B | this control arm | difference |
|---|---|---|---|
| full workflow, accuracy of 20 | 16.0 ± 0.0 | 16.0 (SD 0.0, all runs) | +0.0 |
| full workflow, coverage of 88 | 48.0 ± 2.3 | 48.0 ± 3.2 (range 45.0–51.0) | +0.0 |
| ungated hybrid, accuracy of 20 | 18.0 ± 0.0 | 18.0 (SD 0.0, all runs) | +0.0 |
| ungated hybrid, coverage of 88 | 58.5 ± 1.3 | 58.5 ± 2.3 (range 56.0–61.0) | +0.0 |
| model alone, accuracy of 20 | 15.5 ± 0.4 | 15.5 ± 0.5 (range 15.0–16.0) | +0.0 |
| model alone, coverage of 88 | 57.0 ± 1.7 | 57.0 ± 2.8 (range 54.0–60.0) | +0.0 |

**Reproduction test.** accuracy within 0.5 of 16.0: yes; coverage within 6.9 of 48.0: yes; served model is a gemini-2.5-flash build: yes; at least one run on the archive protocol: yes. Verdict: **the control reproduces the archived campaign**.

The two comparators disagree on 1 labelled slot(s) of the full workflow:

- `Pliego de Cláusula Administrativa.PDF` / `garantia_definitiva`, in 10 of 10 runs: containment scores it **wrong**, the boundary-aware comparator **correct**. Label `5%`; surfaced `5 % del precio final ofertado (excluido el IVA). Preferentemente mediante retención en el precio, con facultad del contr…`.

Every disagreement above is a **false rejection** by containment, not a false acceptance, wherever the boundary-aware column reads correct: the label is present in the surfaced value but separated by punctuation or spacing that substring containment cannot cross. the review anticipated the opposite failure. Both have the same cause, and the direction found here raises the headline figure rather than lowering it.

Operational reliability, control arm: 40 document-runs; requests valid 40 (100%); parseable 40 (100%); truncated at maxOutputTokens 0; usable-record completion 100%; retries 4 (0.10 per call); retries exhausted 0; latency mean 17827 ms, median 19988 ms, p90 24084 ms, max 26493 ms.

Under the boundary-aware comparator the same control runs give:

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| deterministic only | 100.0% (SD 0.0, all runs) | 65.0% (SD 0.0, all runs) | 78.8% (SD 0.0, all runs) | 13.0 (SD 0.0, all runs) | 7.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 13.0 (SD 0.0, all runs) | 13.0 (SD 0.0, all runs) |
| model alone | 89.2% ± 0.3 (range 88.9–89.5) | 82.5% ± 2.6 (range 80.0–85.0) | 85.7% ± 1.6 (range 84.2–87.2) | 16.5 ± 0.5 (range 16.0–17.0) | 1.5 ± 0.5 (range 1.0–2.0) | 2.0 (SD 0.0, all runs) | 18.5 ± 0.5 (range 18.0–19.0) | 57.0 ± 2.8 (range 54.0–60.0) |
| ai gate no rules | 87.9% ± 0.4 (range 87.5–88.2) | 72.5% ± 2.6 (range 70.0–75.0) | 79.4% ± 1.7 (range 77.8–81.1) | 14.5 ± 0.5 (range 14.0–15.0) | 3.5 ± 0.5 (range 3.0–4.0) | 2.0 (SD 0.0, all runs) | 16.5 ± 0.5 (range 16.0–17.0) | 46.5 ± 3.7 (range 43.0–50.0) |
| ungated hybrid | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 58.5 ± 2.3 (range 56.0–61.0) |
| full workflow | 94.4% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 89.5% (SD 0.0, all runs) | 17.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 48.0 ± 3.2 (range 45.0–51.0) |
| robust gate | 94.7% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 92.3% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 45.0 ± 2.1 (range 43.0–47.0) |

Under the boundary-aware comparator the full workflow recovers 17.0 of 20 labelled values at 94% precision, emitting on 18.0 of the 20 labelled slots and 48.0 of the 88 field slots, with 1.0 incorrect emissions. The two comparators disagree on 4 of the 6 configurations here, most on the model alone, which the permissive containment test scores 15.5 against the boundary-aware 16.5, so the choice of scoring rule is not cosmetic on this arm.

---

## 2. Structured output against schema-less plus normaliser

### accepted flat structured-output schema, no normaliser
Factor changed against the control: output contract: flat responseJsonSchema instead of schema-less + normaliser.
Runs complete on all four documents: **5 of 5 planned**. Model served: gemini-2.5-flash. Dates: 2026-09-16.

**Boundary-aware comparator.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 89.1% ± 0.3 (range 88.9–89.5) | 82.0% ± 2.7 (range 80.0–85.0) | 85.4% ± 1.6 (range 84.2–87.2) | 16.4 ± 0.5 (range 16.0–17.0) | 1.6 ± 0.5 (range 1.0–2.0) | 2.0 (SD 0.0, all runs) | 18.4 ± 0.5 (range 18.0–19.0) | 52.8 ± 1.1 (range 52.0–54.0) |
| ai gate no rules | 88.5% ± 0.4 (range 88.2–88.9) | 77.0% ± 2.7 (range 75.0–80.0) | 82.3% ± 1.7 (range 81.1–84.2) | 15.4 ± 0.5 (range 15.0–16.0) | 2.6 ± 0.5 (range 2.0–3.0) | 2.0 (SD 0.0, all runs) | 17.4 ± 0.5 (range 17.0–18.0) | 47.8 ± 1.3 (range 46.0–49.0) |
| full workflow | 94.7% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 92.3% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 49.4 ± 0.9 (range 48.0–50.0) |

**Legacy containment comparator, same runs.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 83.7% ± 0.5 (range 83.3–84.2) | 77.0% ± 2.7 (range 75.0–80.0) | 80.2% ± 1.7 (range 78.9–82.1) | 15.4 ± 0.5 (range 15.0–16.0) | 1.6 ± 0.5 (range 1.0–2.0) | 3.0 (SD 0.0, all runs) | 18.4 ± 0.5 (range 18.0–19.0) | 52.8 ± 1.1 (range 52.0–54.0) |
| ai gate no rules | 82.7% ± 0.5 (range 82.4–83.3) | 72.0% ± 2.7 (range 70.0–75.0) | 77.0% ± 1.8 (range 75.7–78.9) | 14.4 ± 0.5 (range 14.0–15.0) | 2.6 ± 0.5 (range 2.0–3.0) | 3.0 (SD 0.0, all runs) | 17.4 ± 0.5 (range 17.0–18.0) | 47.8 ± 1.3 (range 46.0–49.0) |
| full workflow | 89.5% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 87.2% (SD 0.0, all runs) | 17.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 49.4 ± 0.9 (range 48.0–50.0) |

Under the boundary-aware comparator the full workflow recovers 18.0 of 20 labelled values at 95% precision, emitting on 19.0 of the 20 labelled slots and 49.4 of the 88 field slots, with 1.0 incorrect emissions. Against the control that is 1.0 more correct value and 1.4 more field slots of coverage, which is the whole effect of changing this one factor. The two comparators disagree on 3 of the 3 configurations here, most on the ai gate no rules, which the permissive containment test scores 14.4 against the boundary-aware 15.4, so the choice of scoring rule is not cosmetic on this arm.

Schema compliance: 100% of document-runs returned every declared field with the declared type.

Operational reliability: 20 document-runs; requests valid 20 (100%); parseable 20 (100%); truncated at maxOutputTokens 0; usable-record completion 100%; retries 0 (0.00 per call); retries exhausted 0; latency mean 5437 ms, median 5356 ms, p90 9043 ms, max 9073 ms.
Mean input size 82646 characters; mean tokens per call: prompt 23029, output 1103, total 24132.

---

## 3. Input selection

### full document text as model input
Factor changed against the control: input selection: whole cleaned text instead of head-and-annex selection.
Runs complete on all four documents: **10 of 10 planned**. Model served: gemini-2.5-flash. Dates: 2026-09-15.

**Boundary-aware comparator.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 69.7 ± 0.5 (range 69.0–70.0) |
| ungated hybrid | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 69.7 ± 0.5 (range 69.0–70.0) |
| full workflow | 94.7% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 92.3% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 61.4 ± 0.5 (range 61.0–62.0) |

**Legacy containment comparator, same runs.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 85.0% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 17.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 3.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 69.7 ± 0.5 (range 69.0–70.0) |
| ungated hybrid | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 69.7 ± 0.5 (range 69.0–70.0) |
| full workflow | 89.5% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 87.2% (SD 0.0, all runs) | 17.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 61.4 ± 0.5 (range 61.0–62.0) |

Under the boundary-aware comparator the full workflow recovers 18.0 of 20 labelled values at 95% precision, emitting on 19.0 of the 20 labelled slots and 61.4 of the 88 field slots, with 1.0 incorrect emissions. Against the control that is 1.0 more correct value and 13.4 more field slots of coverage, which is the whole effect of changing this one factor. The two comparators disagree on 3 of the 3 configurations here, most on the model alone, which the permissive containment test scores 17.0 against the boundary-aware 18.0, so the choice of scoring rule is not cosmetic on this arm.

Operational reliability: 40 document-runs; requests valid 40 (100%); parseable 40 (100%); truncated at maxOutputTokens 0; usable-record completion 100%; retries 31 (0.78 per call); retries exhausted 0; latency mean 33780 ms, median 31584 ms, p90 43247 ms, max 84778 ms.
Mean input size 346306 characters; mean tokens per call: prompt 88502, output 5155, total 93657.

### field-specific passage selection
Factor changed against the control: input selection: cue-driven per-field passages instead of head-and-annex selection.
Runs complete on all four documents: **10 of 10 planned**. Model served: gemini-2.5-flash. Dates: 2026-09-15, 2026-09-16.

**Boundary-aware comparator.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 84.2% (SD 0.0, all runs) | 80.0% (SD 0.0, all runs) | 82.1% (SD 0.0, all runs) | 16.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 3.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 63.8 ± 0.8 (range 62.0–65.0) |
| ungated hybrid | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 64.8 ± 0.8 (range 63.0–66.0) |
| full workflow | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 58.6 ± 1.6 (range 56.0–60.0) |

**Legacy containment comparator, same runs.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 84.2% (SD 0.0, all runs) | 80.0% (SD 0.0, all runs) | 82.1% (SD 0.0, all runs) | 16.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 3.0 (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 63.8 ± 0.8 (range 62.0–65.0) |
| ungated hybrid | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 64.8 ± 0.8 (range 63.0–66.0) |
| full workflow | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 58.6 ± 1.6 (range 56.0–60.0) |

Under the boundary-aware comparator the full workflow recovers 19.0 of 20 labelled values at 95% precision, emitting on 20.0 of the 20 labelled slots and 58.6 of the 88 field slots, with 1.0 incorrect emissions. Against the control that is 2.0 more correct values and 10.6 more field slots of coverage, which is the whole effect of changing this one factor. The two comparators agree on every configuration here, so nothing on this arm turns on the containment defect the review raises.

Operational reliability: 40 document-runs; requests valid 40 (100%); parseable 40 (100%); truncated at maxOutputTokens 0; usable-record completion 100%; retries 63 (1.57 per call); retries exhausted 0; latency mean 25555 ms, median 22498 ms, p90 35893 ms, max 108329 ms.
Mean input size 93775 characters; mean tokens per call: prompt 25495, output 4372, total 29867.

---

## 4. Text-layer repair ablation

### text layer without the joinSplitNumbers repair
Factor changed against the control: pre-processing: joinSplitNumbers disabled.
Runs complete on all four documents: **10 of 10 planned**. Model served: gemini-2.5-flash. Dates: 2026-09-16, 2026-09-17.

**Boundary-aware comparator.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 88.9% (SD 0.0, all runs) | 80.0% (SD 0.0, all runs) | 84.2% (SD 0.0, all runs) | 16.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 55.4 ± 0.5 (range 55.0–56.0) |
| ungated hybrid | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 95.0% (SD 0.0, all runs) | 19.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 57.4 ± 0.5 (range 57.0–58.0) |
| full workflow | 94.4% (SD 0.0, all runs) | 85.0% (SD 0.0, all runs) | 89.5% (SD 0.0, all runs) | 17.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 1.0 (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 47.8 ± 1.5 (range 46.0–51.0) |

**Legacy containment comparator, same runs.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 83.3% (SD 0.0, all runs) | 75.0% (SD 0.0, all runs) | 78.9% (SD 0.0, all runs) | 15.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 3.0 (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 55.4 ± 0.5 (range 55.0–56.0) |
| ungated hybrid | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 90.0% (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 0.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 20.0 (SD 0.0, all runs) | 57.4 ± 0.5 (range 57.0–58.0) |
| full workflow | 88.9% (SD 0.0, all runs) | 80.0% (SD 0.0, all runs) | 84.2% (SD 0.0, all runs) | 16.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 2.0 (SD 0.0, all runs) | 18.0 (SD 0.0, all runs) | 47.8 ± 1.5 (range 46.0–51.0) |

Under the boundary-aware comparator the full workflow recovers 17.0 of 20 labelled values at 94% precision, emitting on 18.0 of the 20 labelled slots and 47.8 of the 88 field slots, with 1.0 incorrect emissions. Against the control that is no change in correct values and 0.2 fewer field slots of coverage, which is the whole effect of changing this one factor. The two comparators disagree on 3 of the 3 configurations here, most on the model alone, which the permissive containment test scores 15.0 against the boundary-aware 16.0, so the choice of scoring rule is not cosmetic on this arm.

Operational reliability: 40 document-runs; requests valid 40 (100%); parseable 40 (100%); truncated at maxOutputTokens 0; usable-record completion 100%; retries 58 (1.45 per call); retries exhausted 0; latency mean 19447 ms, median 17826 ms, p90 32585 ms, max 64424 ms.
Mean input size 82650 characters; mean tokens per call: prompt 23066, output 3545, total 26611.

---

## 5. R2 Q6, generic document-information-extraction baseline

### R2 Q6: generic zero-shot document-information-extraction baseline
Factor changed against the control: method: generic key-value extraction with no schema, normaliser, gate or rules.
Runs complete on all four documents: **5 of 5 planned**. Model served: gemini-2.5-flash. Dates: 2026-09-16.

**Boundary-aware comparator.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 82.0% ± 1.8 (range 80.0–83.3) | 23.0% ± 2.7 (range 20.0–25.0) | 35.9% ± 3.5 (range 32.0–38.5) | 4.6 ± 0.5 (range 4.0–5.0) | 14.4 ± 0.5 (range 14.0–15.0) | 1.0 (SD 0.0, all runs) | 5.6 ± 0.5 (range 5.0–6.0) | 19.0 ± 6.7 (range 10.0–25.0) |

**Legacy containment comparator, same runs.**

| configuration | precision | recall | F1 | correct of 20 | abstention | incorrect emission | labelled-slot coverage of 20 | raw coverage of 88 |
|---|---|---|---|---|---|---|---|---|
| model alone | 82.0% ± 1.8 (range 80.0–83.3) | 23.0% ± 2.7 (range 20.0–25.0) | 35.9% ± 3.5 (range 32.0–38.5) | 4.6 ± 0.5 (range 4.0–5.0) | 14.4 ± 0.5 (range 14.0–15.0) | 1.0 (SD 0.0, all runs) | 5.6 ± 0.5 (range 5.0–6.0) | 19.0 ± 6.7 (range 10.0–25.0) |

Under the boundary-aware comparator the model alone recovers 4.6 of 20 labelled values at 82% precision, emitting on 5.6 of the 20 labelled slots and 19.0 of the 88 field slots, with 1.0 incorrect emissions. Against the control that is 11.9 fewer correct values and 38.0 fewer field slots of coverage, which is the whole effect of changing this one factor. The two comparators agree on every configuration here, so nothing on this arm turns on the containment defect the review raises. Reliability is not perfect and is not hidden: 100% of requests were valid and 75% of responses parseable, and the failures stay in every denominator above.

Upper bound for this baseline, counting a label as recovered if any emitted key-value pair carries it whatever key it was filed under: 7.6 ± 0.5 (range 7.0–8.0) of 20.

Operational reliability: 20 document-runs; requests valid 20 (100%); parseable 15 (75%); truncated at maxOutputTokens 5; usable-record completion 65%; retries 5 (0.25 per call); retries exhausted 0; latency mean 19645 ms, median 16690 ms, p90 44717 ms, max 49252 ms.
Mean input size 82646 characters; mean tokens per call: prompt 21602, output 4207, total 25809.

---

## 6. annotated evidence spans reaching the model input
Deterministic; no model call is involved. A span counts as included when the annotated value appears verbatim, after normalisation, in the text actually sent to the model.

| selection rule | characters sent | annotated spans included |
|---|---|---|
| head_annex | 330584 | 19 of 20 (95%) |
| fulltext | 1385223 | 20 of 20 (100%) |
| passage | 375099 | 19 of 20 (95%) |

| document | pages | source characters | head-and-annex | full text | passage |
|---|---|---|---|---|---|
| 9 f PCAP.pdf | 105 | 414857 | 2 of 2 (28.9% of the text) | 2 of 2 | 2 of 2 |
| PCAP DEFINITIVO.pdf | 26 | 78326 | 7 of 7 (100.0% of the text) | 7 of 7 | 7 of 7 |
| PCAP-Next-generation-OBRAS-PROC.-ABIERTO.pdf | 122 | 387912 | 2 of 3 (3.2% of the text) | 3 of 3 | 3 of 3 |
| Pliego de Cláusula Administrativa.PDF | 152 | 504128 | 8 of 8 (23.8% of the text) | 8 of 8 | 7 of 8 |

The current head-and-annex rule reaches 19 of 20 annotated spans, full text reaches 20 and passage selection 19. The rule starves `PCAP-Next-generation-OBRAS-PROC.-ABIERTO.pdf`: it sends 3.2% of that document, 12258 characters of 387912, and withholds 1 of its 3 annotated values, so on that document a missing field cannot be told apart from a field never shown to the model. This measures only what reaches the model, not what the model then does with it; whether supplying the evidence changes the extraction is the `input_fulltext` and `input_passage` arms above.

---

## 7. Operational reliability across the campaign (the review)

| arm | complete runs / planned | document-runs | requests valid | parseable | usable records | retries per call | latency median (ms) | latency p90 (ms) |
|---|---|---|---|---|---|---|---|---|
| control | 10 / 10 | 40 | 100% | 100% | 100% | 0.10 | 19988 | 24084 |
| input_fulltext | 10 / 10 | 40 | 100% | 100% | 100% | 0.78 | 31584 | 43247 |
| input_passage | 10 / 10 | 40 | 100% | 100% | 100% | 1.57 | 22498 | 35893 |
| docie_baseline | 5 / 5 | 20 | 100% | 75% | 65% | 0.25 | 16690 | 44717 |
| schema_flat | 5 / 5 | 20 | 100% | 100% | 100% | 0.00 | 5356 | 9043 |
| no_repair | 10 / 10 | 40 | 100% | 100% | 100% | 1.45 | 17826 | 32585 |

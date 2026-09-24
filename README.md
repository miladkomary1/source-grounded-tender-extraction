# Source-grounded hybrid extraction from construction procurement documents

Reference implementation, evaluation harness, hand-verified labels and analysis scripts
for the manuscript **"Automated reading of building works tender documents: source
grounding verifies retrieval and not interpretation"** (submitted for publication).

The workflow extracts a fixed set of decision-critical fields, budget, estimated contract
value, deadlines, guarantees, solvency and classification requirements, from Spanish
public works tender specifications (*pliegos de cláusulas administrativas particulares*).
Its defining property is that **every surfaced value must be locatable in the source
text** before the value is shown to a user.

---

## What this repository is, and what it is not

It contains the **method and its evaluation**: both engines, both verification gates, the
prompt templates, the schema, the labels, the raw run outputs of two campaigns and every
analysis script used to produce the numbers in the paper.

It does **not** contain the deployed web application (authentication, hosting,
tender-feed monitoring, user interface). Those are product concerns rather than the
contribution, and excluding them keeps this repository to what is needed to reproduce and
scrutinise the results.

---

## Headline results, with their caveats attached

Campaign **C-R2-4DOC**, September 2026: ten runs on the four labelled documents at a
pinned sampling configuration, scored with the boundary-aware comparator. Raw records in
`data/runs/2026-09/results.json`, digest in `results/2026-09/summary.md`.

| Configuration | Correct of 20 | Precision | Recall | F1 | Raw coverage of 88 | Values failing the locatability test |
|---|---|---|---|---|---|---|
| Deterministic engine alone | 13.0 | 100.0 % | 65.0 % | 78.8 % | 13.0 | none |
| Language model alone | 16.5 ± 0.5 | 89.2 % | 82.5 % | 85.7 % | 57.0 ± 2.8 | 18.4 % |
| Ungated hybrid | 19.0 | 95.0 % | 95.0 % | 95.0 % | 58.5 ± 2.3 | 17.9 % |
| **Full workflow, strict gate (canonical)** | **17.0** | **94.4 %** | **85.0 %** | **89.5 %** | **48.0 ± 3.2** | **none** |
| Full workflow, relaxed gate | 18.0 | 94.7 % | 90.0 % | 92.3 % | 49.4 ± 1.3 | none under its own test |

Read these together with the following, all of which are stated in the paper.

- **The corpus is fixed at four documents** with twenty hand-verified values. These
  figures describe run-to-run variability on that corpus; they are **not** estimates of
  population performance.
- **"No value fails the locatability test" holds by construction** for gated
  configurations. The gate removes such values before they can be counted, so this
  confirms the gate works as specified, it is *not* independent evidence that every
  surfaced value is correct.
- **Passing the gate is not the same as being correct.** On the labelled subset the gate
  withheld 2.0 values, both correct, and caught no incorrect one, so precision moves from
  95.0 % to 94.4 % and **specificity is zero**. Locatability establishes that a value
  occurs in the document, not that it was assigned to the right field. This is the
  central result, not a footnote to it.
- **The relaxed gate is exploratory.** It was designed after inspecting errors on these
  same four documents, and its own locatability claim is circular: measured against the
  strict test, 6.7 % of the values it surfaces would not pass. It is reported for
  completeness and is not the configuration the paper reports.
- **Two configurations score above the canonical one.** Field-specific passage selection
  reaches 19.0 of 20 and the accepted flat structured-output schema 18.0, against 17.0
  for the canonical workflow. Both were found on the same four documents, so they are
  reported as sensitivity results to be confirmed on documents not used to find them,
  not promoted to canonical.
- **The text-layer repair has no measurable effect on the labelled corpus**, 17.0 of 20
  with it and without it. It earns its place as a guard against a rare and severe defect:
  glyph spacing emits a printed 40.000,00 as `40 .000,00`, whose only well-formed number
  is the fragment `000,00`. Seven of thirty-seven monetary values on the 26-document
  corpus were surfaced truncated, all from the *deterministic* engine, and **every one
  passed the grounding gate** because a truncation is a verbatim substring.
  `src/pdf-cleaner.mjs` repairs this and `isWellFormedAmount` in
  `src/pipeline/blocks/validate.ts` is the backstop.
- **The arithmetic-validation gate never fired.** All three of its identities take the
  base budget excluding value added tax as an operand, and that field was surfaced zero
  times in both corpora, so no identity was ever evaluated. It is a component that was
  built and not exercised, and it is not claimed as a contribution.
- **An independent reference exists for part of the corpus.** The contracting platform
  publishes a structured record alongside each specification. Procedure type agrees on
  all 24 values the workflow surfaced, and references exist for 26 tenders, so 24 of 26
  available reference values were recovered. Both quantities matter. Run
  `npm run analysis:registry`.
- **The labels were produced by a single annotator who is also the developer of the
  system**, and were restricted to values confirmable verbatim and without ambiguity.
  Both choices plausibly favour the method, and accuracy on this subset should be read as
  a potentially optimistic estimate of accuracy over the full field set. Independent
  re-annotation is the principal outstanding validation; the instrument for it is in
  `human-study/`.
- **No controlled study of practitioner time or workload was carried out.** The workflow
  is offered as an extraction and source-navigation aid that brings a reader to the
  clause carrying a value, not as a screening filter whose output replaces reading.

### Reproduction of the August campaign

The September control arm reproduces the archived August campaign to **+0.0 on all six
quantities** (accuracy and coverage of the full workflow, the ungated hybrid and the
model alone). The two campaigns agree; only the comparator differs. Scored with the
substring-containment test the harness originally shipped with, the same runs return
16.0 of 20 and 88.9 % precision, because containment cannot cross the space in a surfaced
`5 % del precio final ofertado` against a reference of `5 %` and scores as wrong a value
that is right. `results/2026-09/summary.md` reports the comparison in full.

### Label-free replication on 26 further tenders

Pooled over three passes at the pinned configuration, August 2026, after the text-layer
repair. These documents carry no labels, so accuracy is not reported.

| Configuration | Coverage (of 572) | Unverifiable share |
|---|---|---|
| Deterministic engine only | 96 (17 %) | 0 % |
| Language-model engine alone | 393.0 ± 5.0 | 26.0 ± 0.0 % |
| Hybrid, ungated | 412.0 ± 5.0 | 23.7 ± 1.4 % |
| Full workflow, strict gate | 314.3 ± 2.9 | 0 % |
| Full workflow, relaxed gate | 318.0 ± 4.3 | 0 % |

The share of model values failing the locatability test is higher here than on the
four-document corpus, which indicates that the problem the gate addresses grows with
template diversity. Reproduce with `npm run analysis:pool`; the pass logs are in
`results/campaign-logs/`. This corpus was not re-run in September.

---

## Cost

Measured from the archived per-call usage of the canonical campaign, at prices accessed
16 September 2026:

| | per document |
|---|---|
| prompt tokens | 23,029 |
| output tokens | 3,914 |
| model interface charge | USD 0.0167 |

Token counts are the primary quantity, because they stay valid after provider prices
change. The charge is the model interface charge and nothing else: reading time,
deployment and operation are not measured. One call is issued per document and no call is
avoided. Run `npm run analysis:cost`; every arm is listed in `results/2026-09/cost.txt`.

---

## Reproducing the results

```bash
npm install
```

Analyses that read only the committed run outputs, **no API key, no network**:

```bash
npm run analysis:cost          # model interface charge per arm, September campaign
npm run analysis:consolidate   # campaign pooling and variance components
npm run analysis:precision     # non-circular precision against the golden labels
npm run analysis:confusion     # the gate confusion matrix on the labelled subset
npm run analysis:registry      # agreement and completeness against the platform records
npm run analysis:pool          # the 26-document replication, pooled over three passes
```

Analyses that re-query a model provider need a key in the environment. Nothing is
hard-coded:

```bash
export GKEY=...          # Google Generative Language API
export DEEPSEEK_KEY=...  # cross-model replication
npm run analysis:crossmodel
```

The sampling configuration is pinned so that runs are reproducible:
`temperature 0, topP 1, maxOutputTokens 8192, thinkingBudget 0`, model `gemini-2.5-flash`
(endpoint `v1beta`). Leaving these at provider defaults was the cause of the run-to-run
spread reported in the paper: at the default temperature of 1.0, campaign means were
17.0, 16.2 and 16.4 of 20, whereas the pinned configuration returns the same count in
every run.

### External baseline

`analysis/docling-compare.mjs` holds the extraction engine constant and swaps only the
parser, comparing pdfjs with the layout-aware
[Docling](https://github.com/docling-project/docling) converter. On Windows, set the
torch flags **before** importing torch; `analysis/docling-baseline.py` does this at the
top of the file, and setting them in the shell is too late and fails with
`InvalidCxxCompiler: cl is not found`.

---

## Layout

```
src/                    the method: deterministic engine, LM engine, both gates, normalizer, prompts, schema
  pipeline/blocks/ground.ts      source-grounding gate
  pipeline/blocks/validate.ts    arithmetic-validation gate
  pipeline/blocks/merge-ficha.ts field-by-field merge, deterministic precedence
data/                   golden labels, corpus manifest, raw run outputs
  runs/2026-09/         the canonical campaign: every field of every document of every run
analysis/               the scripts that produce the numbers of the August campaign
  2026-09/              the harness that executed and scored the canonical campaign
results/                the outputs those scripts produce, as committed
  2026-09/              the canonical campaign: results digest, configuration, cost
human-study/            two browser-based instruments for independent annotation and audit
```

---

## Data availability

`data/golden-labels.json` holds the twenty hand-verified values. `data/corpus-manifest.json`
describes the twenty-six tenders of the label-free replication, giving for each one its
*expediente* reference, province, procedure type, base budget and page count.

The tender documents themselves are public records published by the Spanish
[Plataforma de Contratación del Sector Público](https://contrataciondelestado.es), and can
be located there by *expediente* reference. The manifest does not record a permanent
source URL, because the documents were harvested from the platform's syndication feed,
whose entries are rotated out.

**Every figure of the canonical campaign can be recomputed from this repository without
the source PDFs and without querying the model**, because `data/runs/2026-09/results.json`
archives every field of every document of every run, with the request outcome, the
latency and the token usage of each call. The August campaign archives a console
transcript and value-level harvests, so its figures can be checked against those
transcripts but not recomputed from raw outputs. The PDFs are needed only to re-run
extraction from scratch or to repeat the human-study tasks; a copy of the document set is
available from the corresponding author on request.

## Citing

Please cite the article. `CITATION.cff` carries the metadata, and the archived release has
its own DOI.

## Licence

Code MIT. Contents of `data/` and `results/` CC BY 4.0. See `LICENSE`.

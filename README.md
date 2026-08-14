# Source-grounded hybrid extraction from construction procurement documents

Reference implementation, evaluation harness, hand-verified labels and analysis scripts for the manuscript
**“Source-grounded hybrid extraction of decision-critical information from construction procurement documents”**
(submitted to *Automation in Construction*).

The workflow extracts a fixed set of decision-critical fields, budget, estimated contract value, deadlines,
guarantees, solvency and classification requirements, from Spanish public works tender specifications
(*pliegos de cláusulas administrativas particulares*). Its defining property is that **every surfaced value must be
locatable in the source text**, and monetary arithmetic must reconcile, before the value is shown to a user.

---

## What this repository is, and what it is not

It contains the **method and its evaluation**: both engines, both verification gates, the prompt templates, the
schema, the labels, the raw run outputs and every analysis script used to produce the numbers in the paper.

It does **not** contain the deployed web application (authentication, hosting, tender-feed monitoring, user
interface). Those are product concerns rather than the contribution, and excluding them keeps this repository
to what is needed to reproduce and scrutinise the results.

---

## Headline results, with their caveats attached

Ten pinned runs on the four labelled documents, after the text-layer repair described below.

| Configuration | Accuracy (of 20) | Values failing the locatability test |
|---|---|---|
| Deterministic engine alone | 13.0 | none |
| Language model alone | 15.5 ± 0.4 | 18.5 % |
| Ungated hybrid | 18.0 ± 0.0 | 18.0 % |
| Full workflow, strict gate | 16.0 ± 0.0 | none |
| **Full workflow, relaxed gate** | **18.0 ± 0.0** | **none** |

Read these together with the following, all of which are stated in the paper:

- **The corpus is fixed at four documents** with twenty hand-verified values. These figures describe run-to-run
  variability on that corpus; they are **not** estimates of population performance.
- **“No value fails the locatability test” holds by construction** for gated configurations. The gate removes such
  values before they can be counted, so this confirms the gate works as specified, it is *not* independent
  evidence that every surfaced value is correct.
- **Passing the gate is not the same as being correct.** The full confusion matrix on the labelled subset is
  TP 16, FP 2, FN 2, **TN 0**: the gate withheld two values, both correct, caught no incorrect value, and let
  through the two that were wrong. Precision and recall are 88.9 %; **specificity is zero**. Locatability
  establishes that a value occurs in the document, not that it was assigned to the right field.
  Run `npm run analysis:confusion`.
- **A parser defect masqueraded as model hallucination.** Glyph spacing in the PDF text layer emits a printed
  40.000,00 as `40 .000,00`, whose only well-formed number is the fragment `000,00`. Seven of thirty-seven
  monetary values on the 26-document corpus were surfaced truncated, all from the *deterministic* engine, and
  **every one passed the grounding gate** because a truncation is a verbatim substring. `src/pdf-cleaner.mjs`
  repairs this before extraction and `isWellFormedAmount` in `src/pipeline/blocks/validate.ts` is the backstop.
- **An independent reference exists for part of the corpus.** The contracting platform publishes a structured
  record alongside each specification; procedure type agrees on 24 of 24 tenders with no manual annotation.
  This is what exposed the truncation defect. Run `npm run analysis:registry`.
- **The ungated configuration scores higher.** Accuracy scoring rewards answering over abstaining, so a system
  that declines to surface what it cannot verify is penalised relative to one that guesses. The gated
  configuration is nonetheless the canonical one here, because it is the only one whose output can be acted on
  without re-reading the document.
- **The labels were produced by a single annotator who is also the developer of the system**, and were restricted
  to values confirmable verbatim and without ambiguity. Both choices plausibly favour the method. Independent
  re-annotation is the principal outstanding validation; the instrument for it is in `human-study/`.

Results are reproduced by `analysis/`, and the raw outputs they consume are in `data/runs/`.

---

## Reproducing the results

```bash
npm install
```

Analyses that read only the committed run outputs, **no API key, no network**:

```bash
npm run analysis:consolidate   # campaign pooling and variance components
npm run analysis:precision     # non-circular precision against the golden labels
npm run analysis:cost          # cost on the fair baseline, from measured token counts
```

Analyses that re-query a model provider need a key in the environment. Nothing is hard-coded:

```bash
export GKEY=...          # Google Generative Language API
export DEEPSEEK_KEY=...  # cross-model replication
npm run analysis:crossmodel
```

The sampling configuration is pinned so that runs are reproducible:
`temperature 0, topP 1, maxOutputTokens 8192, thinkingBudget 0`, model `gemini-2.5-flash` (endpoint `v1beta`).
Leaving these at provider defaults was the cause of the run-to-run spread reported in the paper, the default
temperature of 1.0 produced campaign means of 17.0, 16.2 and 16.4, whereas pinned runs return 16.0 every time.

### External baseline

`analysis/docling-compare.mjs` holds the extraction engine constant and swaps only the parser, comparing pdfjs
with the layout-aware [Docling](https://github.com/docling-project/docling) converter. On Windows, set the torch
flags **before** importing torch, `analysis/docling-baseline.py` does this at the top of the file; setting them
in the shell is too late and fails with `InvalidCxxCompiler: cl is not found`.

---

## Layout

```
src/           the method: deterministic engine, LM engine, both gates, normalizer, prompts, schema
  pipeline/blocks/ground.ts      source-grounding gate
  pipeline/blocks/validate.ts    arithmetic-validation gate
  pipeline/blocks/merge-ficha.ts field-by-field merge, deterministic precedence
data/          golden labels, corpus manifest, raw run outputs
analysis/      every script that produces a number in the paper
results/       the outputs those scripts produce, as committed
human-study/   two browser-based instruments for independent annotation and audit
```

---

## Data availability

`data/golden-labels.json` holds the twenty hand-verified values. `data/corpus-manifest.json` describes the
twenty-six tenders of the label-free replication, giving for each one its *expediente* reference, province,
procedure type, base budget and page count.

The tender documents themselves are public records published by the Spanish
[Plataforma de Contratación del Sector Público](https://contrataciondelestado.es), and can be located there by
*expediente* reference. The manifest does not record a permanent source URL, because the documents were harvested
from the platform's syndication feed, whose entries are rotated out.

**Every figure reported in the paper can be reproduced from this repository without the source PDFs**, because the
raw per-run extraction outputs are committed in `data/runs/`. The PDFs are needed only to re-run extraction from
scratch or to repeat the human-study tasks. A copy of the document set is being prepared as a separate archived
release; until then it is available from the corresponding author on request.

---

## Citing

Please cite the article. `CITATION.cff` carries the metadata, and the archived release has its own DOI.

## Licence

Code MIT. Contents of `data/` and `results/` CC BY 4.0. See `LICENSE`.

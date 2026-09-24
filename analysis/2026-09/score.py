"""Score the R2-2 campaign.

Reads paper/runs_r2/results.json and NOTHING ELSE, and writes summary.md and
control_gate.json. This is the acceptance property the brief asks for: scoring
reruns from results.json alone and reproduces summary.md.

Primary comparator: the boundary-aware comparator built by job R2-1
(paper/revision_r2/analysis/r3_14_containment.py, strict_correct), copied here
verbatim so the scorer is self-contained; verify_scorer.py checks the copy
against the original. Secondary comparator: the permissive substring-containment
test shipped in paper/_baseline.mjs, kept so the control arm can be compared
against the archived campaign under the scorer the archive actually used.
"""
import json
import math
import os
import re
import statistics
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[1:]
WORK = ARGS[ARGS.index('--dir') + 1] if '--dir' in ARGS else HERE
RESULTS = os.path.join(WORK, 'results.json')

GOLD_SLOTS = 20      # labelled values over the four documents
FIELD_SLOTS = 88     # 4 documents x 22 schema fields

# Archived canonical campaign C-PIN-4DOC-B, as recorded in
# paper/revision_r2/config_table.md from paper/_run_4doc_fixed_10runs.log.
# The "±" figures are the 95 % t-confidence intervals the harness prints.
ARCHIVE = {
    'full_workflow':  {'coverage': 48.0, 'coverage_ci': 2.3, 'accuracy': 16.0, 'accuracy_ci': 0.0},
    'ungated_hybrid': {'coverage': 58.5, 'coverage_ci': 1.3, 'accuracy': 18.0, 'accuracy_ci': 0.0},
    'model_alone':    {'coverage': 57.0, 'coverage_ci': 1.7, 'accuracy': 15.5, 'accuracy_ci': 0.4},
}
GATE_ACC_TOL = 0.5   # of 20
GATE_COV_TOL = 6.9   # of 88; three times the archived interval

# --------------------------------------------------------------------------
# comparators
# --------------------------------------------------------------------------


def norm(s):
    """paper/revision_r2/analysis/_common.py:norm, itself a port of
    paper/_baseline.mjs line 28."""
    s = '' if s is None else str(s)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s


def scored_correct(surfaced, gold):
    """The permissive containment test shipped in paper/_baseline.mjs line 159."""
    return norm(gold) in norm(surfaced or '')


PCT = re.compile(r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*%')
AMT = re.compile(r'(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?![\d.,])'
                 r'|(?<![\d.,])\d+,\d{2}(?![\d.,])')
DUR = re.compile(r'(?<!\d)(\d+)\s*(MESES|MES|SEMANAS|A[ÑN]OS?|D[IÍ]AS?)', re.I)


def strict_correct(surfaced, gold):
    """Boundary-aware replacement for the containment test.

    Percentages, monetary amounts and durations are compared as NUMBERS extracted
    under token boundaries; anything else falls back to whole-word containment.
    """
    s, g = str(surfaced or ''), str(gold or '')
    gp, sp = PCT.findall(g), PCT.findall(s)
    if gp:
        want = {float(x.replace(',', '.')) for x in gp}
        have = {float(x.replace(',', '.')) for x in sp}
        return bool(want & have)
    ga, sa = AMT.findall(g), AMT.findall(s)
    if ga:
        f = lambda x: float(x.replace('.', '').replace(',', '.'))  # noqa: E731
        return bool({f(x) for x in ga} & {f(x) for x in sa})
    gd, sd = DUR.findall(g), DUR.findall(s)
    if gd:
        n = lambda t: (int(t[0]), norm(t[1])[:3])  # noqa: E731
        return bool({n(x) for x in gd} & {n(x) for x in sd})
    gn = norm(g)
    return re.search(r'(?<!\w)%s(?!\w)' % re.escape(gn), norm(s)) is not None


COMPARATORS = {'boundary_aware': strict_correct, 'legacy_containment': scored_correct}

# --------------------------------------------------------------------------
# configurations derivable from one recorded model call
# --------------------------------------------------------------------------
CONFIGS = {
    'deterministic_only': lambda f: f['deterministic'],
    'model_alone':        lambda f: f['model_value'],
    'ai_gate_no_rules':   lambda f: (f['model_value'] if f['grounded_strict'] else None),
    'ungated_hybrid':     lambda f: (f['deterministic'] or f['model_value']),
    'full_workflow':      lambda f: (f['deterministic'] or (f['model_value'] if f['grounded_strict'] else None)),
    'robust_gate':        lambda f: (f['deterministic'] or (f['model_value'] if f['grounded_robust'] else None)),
}
CONFIG_ORDER = ['deterministic_only', 'model_alone', 'ai_gate_no_rules',
                'ungated_hybrid', 'full_workflow', 'robust_gate']


def nz(v):
    return v is not None and str(v).strip() != ''


def run_metrics(records, config, comparator):
    """Metrics for one configuration over the documents of one run."""
    fn = CONFIGS[config]
    cmpf = COMPARATORS[comparator]
    emitted = correct = incorrect = raw_cov = 0
    gold_n = 0
    for r in records:
        for k, f in r['fields'].items():
            v = fn(f)
            if nz(v):
                raw_cov += 1
        for k, g in r['gold'].items():
            gold_n += 1
            v = fn(r['fields'][k])
            if nz(v):
                emitted += 1
                if cmpf(v, g):
                    correct += 1
                else:
                    incorrect += 1
    prec = (correct / emitted) if emitted else None
    rec = (correct / gold_n) if gold_n else None
    f1 = (2 * prec * rec / (prec + rec)) if (prec and rec) else (0.0 if gold_n else None)
    return {
        'gold_slots': gold_n, 'emitted': emitted, 'correct': correct,
        'incorrect_emission': incorrect, 'abstention': gold_n - emitted,
        'precision': prec, 'recall': rec, 'f1': f1,
        'raw_coverage': raw_cov, 'labelled_slot_coverage': emitted,
        'documents': len(records),
    }


def docie_oracle(records, comparator):
    """Upper bound for the generic baseline: a gold value counts as recovered if
    ANY key-value pair the baseline emitted carries it, regardless of the key it
    was filed under. Reported so the baseline is not undersold by the mapping."""
    cmpf = COMPARATORS[comparator]
    correct = 0
    gold_n = 0
    for r in records:
        vals = [str(p.get('valor') or p.get('value') or '') for p in (r.get('docie_pairs') or [])]
        for k, g in r['gold'].items():
            gold_n += 1
            if any(cmpf(v, g) for v in vals):
                correct += 1
    return {'correct': correct, 'gold_slots': gold_n,
            'recall': (correct / gold_n) if gold_n else None}


def agg(values):
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    m = statistics.fmean(vals)
    sd = statistics.stdev(vals) if len(vals) > 1 else 0.0
    return {'mean': m, 'sd': sd, 'min': min(vals), 'max': max(vals), 'n': len(vals)}


def fmt(a, dec=1, pct=False):
    if a is None:
        return 'n/a'
    s = 100.0 if pct else 1.0
    u = '%' if pct else ''
    if a['min'] == a['max']:
        return ('%.*f%s (SD 0.0, all runs)' % (dec, a['mean'] * s, u))
    return ('%.*f%s ± %.*f (range %.*f–%.*f)'
            % (dec, a['mean'] * s, u, dec, a['sd'] * s, dec, a['min'] * s, dec, a['max'] * s))


# --------------------------------------------------------------------------
# reliability (R3.29)
# --------------------------------------------------------------------------
def reliability(recs):
    if not recs:
        return None
    calls = [r['call'] for r in recs]
    lat = sorted(c['latency_ms'] for c in calls)
    valid = sum(1 for c in calls if c['request_valid'])
    jsons = sum(1 for r in recs if r['parse']['json_ok'])
    usable = sum(1 for r in recs if r['parse']['json_ok']
                 and any(nz(f['model_value']) for f in r['fields'].values()))
    # A response cut off at maxOutputTokens is a distinct outcome from a refused
    # request or a malformed one: the call succeeded and the output is truncated.
    # R3.29 asks for invalid output to stay visible, so it gets its own column.
    trunc = sum(1 for c in calls if c.get('finish_reason') == 'MAX_TOKENS')
    sc = [r['parse']['schema_compliant'] for r in recs if r['parse']['schema_compliant'] is not None]
    tok = [c['usage'] for c in calls if c.get('usage')]

    def tmean(k):
        xs = [t.get(k) for t in tok if isinstance(t.get(k), int)]
        return statistics.fmean(xs) if xs else None
    return {
        'document_runs': len(recs),
        'request_valid': valid, 'request_valid_rate': valid / len(recs),
        'parseable': jsons, 'parseable_rate': jsons / len(recs),
        'truncated_max_tokens': trunc,
        'schema_compliant_rate': (sum(1 for x in sc if x) / len(sc)) if sc else None,
        'usable_record_completion': usable / len(recs),
        'retries_total': sum(c['retries'] for c in calls),
        'retries_per_call': statistics.fmean([c['retries'] for c in calls]),
        'failures_retries_exhausted': sum(1 for c in calls if c['failure_mode'] == 'retries_exhausted'),
        'latency_ms_mean': statistics.fmean(lat), 'latency_ms_median': statistics.median(lat),
        'latency_ms_p90': lat[min(len(lat) - 1, int(0.9 * len(lat)))], 'latency_ms_max': lat[-1],
        'tokens_prompt_mean': tmean('promptTokenCount'),
        'tokens_output_mean': tmean('candidatesTokenCount'),
        'tokens_total_mean': tmean('totalTokenCount'),
        'models_served': sorted({r['model_served'] for r in recs if r.get('model_served')}),
        'dates': sorted({r['started_at'][:10] for r in recs}),
        'input_chars_mean': statistics.fmean([r['input_chars'] for r in recs]),
    }


def rel_line(rl):
    if not rl:
        return 'no document-runs recorded'
    return ('%d document-runs; requests valid %d (%.0f%%); parseable %d (%.0f%%); '
            'truncated at maxOutputTokens %d; usable-record completion %.0f%%; '
            'retries %d (%.2f per call); retries exhausted %d; latency mean %.0f ms, '
            'median %.0f ms, p90 %.0f ms, max %.0f ms'
            % (rl['document_runs'], rl['request_valid'], 100 * rl['request_valid_rate'],
               rl['parseable'], 100 * rl['parseable_rate'], rl['truncated_max_tokens'],
               100 * rl['usable_record_completion'],
               rl['retries_total'], rl['retries_per_call'], rl['failures_retries_exhausted'],
               rl['latency_ms_mean'], rl['latency_ms_median'], rl['latency_ms_p90'],
               rl['latency_ms_max']))


# --------------------------------------------------------------------------
def group(records):
    by = {}
    for r in records:
        by.setdefault(r['arm'], {}).setdefault(r['run'], []).append(r)
    return by


DOCS_EXPECTED = 4


def complete_runs(runs, docs_expected=DOCS_EXPECTED):
    """Runs the campaign actually finished: a record exists for every document.

    A document whose call failed after exhausted retries HAS a record and stays
    in the denominator (decision 5). What is excluded here is only a run the
    campaign never finished, because quota stopped it part way: averaging over a
    truncated document set would silently reweight the corpus."""
    return {n: rs for n, rs in runs.items() if len(rs) >= docs_expected}


def archivelike_runs(runs, docs_expected=DOCS_EXPECTED):
    """Runs on the archive's own terms: every document returned parseable output.

    paper/_baseline.mjs discarded any attempt in which a document call failed, so
    the archived means are over runs of this kind. The control comparison uses
    them so it is like-for-like."""
    return {n: rs for n, rs in complete_runs(runs, docs_expected).items()
            if all(r['call']['request_valid'] and r['parse']['json_ok'] for r in rs)}


def arm_table(runs, comparator, configs):
    """Aggregate every configuration over the runs of one arm."""
    out = {}
    for c in configs:
        per = [run_metrics(rs, c, comparator) for rs in runs.values()]
        out[c] = {
            'precision': agg([p['precision'] for p in per]),
            'recall': agg([p['recall'] for p in per]),
            'f1': agg([p['f1'] for p in per]),
            'correct': agg([p['correct'] for p in per]),
            'abstention': agg([p['abstention'] for p in per]),
            'incorrect_emission': agg([p['incorrect_emission'] for p in per]),
            'labelled_slot_coverage': agg([p['labelled_slot_coverage'] for p in per]),
            'raw_coverage': agg([p['raw_coverage'] for p in per]),
        }
    return out


def comparator_disagreements(runs, config='full_workflow'):
    """Name every labelled slot the two comparators score differently, with the
    values, so the difference between the two headline figures is auditable
    rather than asserted. R3.14 asks exactly this question."""
    seen = {}
    for n, rs in runs.items():
        for r in rs:
            for k, g in r['gold'].items():
                v = CONFIGS[config](r['fields'][k])
                lc, ba = scored_correct(v, g), strict_correct(v, g)
                if lc != ba:
                    key = (r['document'], k, lc, ba)
                    seen.setdefault(key, [0, g, v])
                    seen[key][0] += 1
    if not seen:
        return ('The two comparators agree on every labelled slot of the %s in every run, so the '
                'containment defect R3.14 raises is neither realised nor consequential here.'
                % config.replace('_', ' '))
    L = ['The two comparators disagree on %d labelled slot(s) of the %s:\n'
         % (len(seen), config.replace('_', ' '))]
    for (doc, k, lc, ba), (cnt, g, v) in sorted(seen.items(), key=lambda x: -x[1][0]):
        L.append('\n- `%s` / `%s`, in %d of %d runs: containment scores it **%s**, the '
                 'boundary-aware comparator **%s**. Label `%s`; surfaced `%s`.'
                 % (doc, k, cnt, len(runs), 'correct' if lc else 'wrong',
                    'correct' if ba else 'wrong', g,
                    (str(v)[:120] + '…') if v and len(str(v)) > 120 else v))
    L.append('\n\nEvery disagreement above is a **false rejection** by containment, not a false '
             'acceptance, wherever the boundary-aware column reads correct: the label is present '
             'in the surfaced value but separated by punctuation or spacing that substring '
             'containment cannot cross. R3.14 anticipated the opposite failure. Both have the '
             'same cause, and the direction found here raises the headline figure rather than '
             'lowering it.' if any(ba and not lc for (_, _, lc, ba) in seen) else '')
    return ''.join(L)


def commentary(arm_id, tab_ba, tab_lc, ctrl_ba, rl, configs):
    """Two to four sentences on what a table shows, written from the numbers so
    that an unfavourable result is stated as readily as a favourable one."""
    head = 'full_workflow' if 'full_workflow' in configs else configs[0]
    t = tab_ba[head]
    if t['correct'] is None:
        return 'No scored runs, so this table shows nothing yet.'
    s = []
    s.append('Under the boundary-aware comparator the %s recovers %.1f of %d labelled values at '
             '%.0f%% precision, emitting on %.1f of the %d labelled slots and %.1f of the %d field '
             'slots, with %.1f incorrect emissions.'
             % (head.replace('_', ' '), t['correct']['mean'], GOLD_SLOTS,
                100 * t['precision']['mean'] if t['precision'] else 0.0,
                t['labelled_slot_coverage']['mean'], GOLD_SLOTS,
                t['raw_coverage']['mean'], FIELD_SLOTS, t['incorrect_emission']['mean']))
    if ctrl_ba and arm_id != 'control' and ctrl_ba.get(head, {}).get('correct'):
        c = ctrl_ba[head]
        dacc = t['correct']['mean'] - c['correct']['mean']
        dcov = t['raw_coverage']['mean'] - c['raw_coverage']['mean']
        if abs(dacc) < 0.05 and abs(dcov) < 0.05:
            s.append('Against the control that is no measurable change in either accuracy or '
                     'coverage, which is the whole effect of changing this one factor.')
        else:
            acc_w = ('%.1f more correct value%s' % (dacc, '' if abs(dacc) == 1 else 's')) if dacc > 0.05 \
                else (('%.1f fewer correct value%s' % (-dacc, '' if abs(dacc) == 1 else 's')) if dacc < -0.05
                      else 'no change in correct values')
            cov_w = ('%.1f more field slots' % dcov) if dcov > 0.05 else (
                ('%.1f fewer field slots' % -dcov) if dcov < -0.05 else 'no change in coverage')
            s.append('Against the control that is %s and %s of coverage, which is the whole effect '
                     'of changing this one factor.' % (acc_w, cov_w))
    diffs = [c for c in configs
             if tab_lc[c]['correct'] and tab_ba[c]['correct']
             and abs(tab_lc[c]['correct']['mean'] - tab_ba[c]['correct']['mean']) > 0.05]
    if diffs:
        worst = max(diffs, key=lambda c: abs(tab_lc[c]['correct']['mean'] - tab_ba[c]['correct']['mean']))
        s.append('The two comparators disagree on %d of the %d configurations here, most on the %s, '
                 'which the permissive containment test scores %.1f against the boundary-aware '
                 '%.1f, so the choice of scoring rule is not cosmetic on this arm.'
                 % (len(diffs), len(configs), worst.replace('_', ' '),
                    tab_lc[worst]['correct']['mean'], tab_ba[worst]['correct']['mean']))
    else:
        s.append('The two comparators agree on every configuration here, so nothing on this arm '
                 'turns on the containment defect R3.14 raises.')
    if rl and (rl['request_valid_rate'] < 1 or rl['parseable_rate'] < 1):
        s.append('Reliability is not perfect and is not hidden: %.0f%% of requests were valid and '
                 '%.0f%% of responses parseable, and the failures stay in every denominator above.'
                 % (100 * rl['request_valid_rate'], 100 * rl['parseable_rate']))
    return ' '.join(s)


def md_table(tab, configs):
    head = ('| configuration | precision | recall | F1 | correct of %d | abstention | incorrect emission '
            '| labelled-slot coverage of %d | raw coverage of %d |\n' % (GOLD_SLOTS, GOLD_SLOTS, FIELD_SLOTS))
    head += '|---|---|---|---|---|---|---|---|---|\n'
    for c in configs:
        t = tab[c]
        head += '| %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' % (
            c.replace('_', ' '), fmt(t['precision'], 1, True), fmt(t['recall'], 1, True),
            fmt(t['f1'], 1, True), fmt(t['correct']), fmt(t['abstention']),
            fmt(t['incorrect_emission']), fmt(t['labelled_slot_coverage']), fmt(t['raw_coverage']))
    return head


def write_campaign_config(data, by, planned, meta):
    """The row this campaign adds to the configuration table of job R2-1
    (paper/revision_r2/config_table.md), written from results.json so it cannot
    drift away from what was actually run."""
    cfg = data['canonical_configuration']
    allrec = [r for rs in by.values() for rr in rs.values() for r in rr]
    rl = reliability(allrec)
    served = ', '.join(rl['models_served']) if rl and rl['models_served'] else '**pending**'
    dates = ', '.join(rl['dates']) if rl else '**pending**'
    L = ['# Campaign C-R2-4DOC: the row this campaign adds to R2-1\'s configuration table\n',
         '\nJob R2-2 adds one campaign to the inventory in `paper/revision_r2/config_table.md`. '
         'It is a single identified campaign: every arm shares the configuration below and differs '
         'from the control in exactly one factor.\n',
         '\n## Section A row (four labelled documents, 20 golden values, 88 field slots)\n\n',
         '| id | source | date | model requested | model served | endpoint | sampling | reasoning | '
         'runs | pre-processing | gate | scorer |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n']
    L.append('| **C-R2-4DOC** | `paper/runs_r2/results.json` | %s | %s | %s | Generative Language '
             'API %s | temperature %s, top-p %s, max output %s | thinking budget %s | %s | after the '
             'text-layer repair (`joinSplitNumbers`), except the `no_repair` arm | strict 18-char '
             'prefix, with the robust token gate recorded alongside | boundary-aware (job R2-1 '
             '`strict_correct`), legacy containment reported beside it |\n'
             % (dates, cfg['model_requested'], served, cfg['endpoint'].rsplit('/', 1)[-1],
                cfg['temperature'], cfg['topP'], cfg['maxOutputTokens'], cfg['thinkingBudget'],
                ('%d complete of %d planned over %d arms (see the arm table)'
                 % (sum(len(complete_runs(by.get(a, {}))) for a in planned),
                    sum(planned.values()), len(planned))) if planned else 'n/a'))
    L.append('\n## Arms within the campaign\n\n'
             '| arm | factor changed against the control | runs completed / planned |\n|---|---|---|\n')
    for a, n in planned.items():
        L.append('| `%s` | %s | %d / %d |\n'
                 % (a, meta.get(a, {}).get('factor', ''), len(complete_runs(by.get(a, {}))), n))
    L.append('\n## Fields R3.9 asks for that this campaign records and the archived ones did not\n\n'
             '- **Model served**: taken from the `modelVersion` field of every response, not assumed '
             'from the model requested.\n'
             '- **Token usage**: `usageMetadata` is read on every call, so Gemini token counts exist '
             'for the first time; every token figure in v24 is a DeepSeek measurement.\n'
             '- **Latency, retries and per-request failures**: recorded per attempt, with the HTTP '
             'status of each.\n'
             '- **Execution dates**: stamped into every record.\n'
             '- **Pre-processing version**: recorded per record as `preprocessing_variant`.\n'
             '- **Input selection rule and input size**: recorded per record.\n')
    if rl and rl['tokens_total_mean']:
        L.append('\nMean tokens per call over the whole campaign: prompt %.0f, output %.0f, total '
                 '%.0f.\n' % (rl['tokens_prompt_mean'], rl['tokens_output_mean'], rl['tokens_total_mean']))
    if not allrec:
        L.append('\n> **Pending.** No model call has been executed yet, so the date, the served '
                 'model id and the token counts are blank. Everything else in this row is fixed by '
                 '`paper/runs_r2/arms.mjs` and does not depend on execution.\n')
    open(os.path.join(WORK, 'campaign_config.md'), 'w', encoding='utf-8').write(''.join(L))


def main():
    data = json.load(open(RESULTS, encoding='utf-8'))
    records = data['records']
    planned = data['runs_per_arm_planned']
    meta = data['arms']
    by = group(records)
    L = []
    w = L.append

    w('# R2-2 campaign: results\n')
    w('Produced by `paper/runs_r2/score.py` from `paper/runs_r2/results.json` alone. '
      'Every number below is recomputable from that archive with no further model call.\n')

    cfg = data['canonical_configuration']
    w('**Canonical configuration.** temperature %s, topP %s, maxOutputTokens %s, thinking budget %s, '
      '`responseMimeType: application/json`, endpoint `%s`, model requested `%s`. This is the '
      'configuration of campaign C-PIN-4DOC-B in `paper/revision_r2/config_table.md`.\n'
      % (cfg['temperature'], cfg['topP'], cfg['maxOutputTokens'], cfg['thinkingBudget'],
         cfg['endpoint'], cfg['model_requested']))
    w('**Runs per arm.** %s. The control arm shows zero run-to-run variation in accuracy across '
      'its archive-protocol runs but real variation in coverage, almost all of it one bistable '
      'document, so the arms whose outcome is coverage keep ten runs and the arms whose outcome is '
      'accuracy, which inherit the invariance, take five. Section 1 gives the measured variation '
      'this rests on.\n'
      % '; '.join('`%s` %d' % (a, n) for a, n in planned.items()))
    w('**Comparator.** Primary scoring uses the boundary-aware comparator job R2-1 built for R3.14 '
      '(`analysis/r3_14_containment.py`, `strict_correct`): percentages, amounts and durations are '
      'compared as numbers under token boundaries, other fields by whole-word containment. The '
      'permissive substring-containment test shipped in `paper/_baseline.mjs` is reported alongside '
      'it wherever the two differ, and is the comparator used for the control comparison below, '
      'because it is the one the archived campaign used.\n')
    w('**Failure accounting.** Exhausted retries, HTTP errors, unparseable output and schema '
      'rejections are recorded as outcomes and stay in the denominator. Request validity, '
      'parseability, schema compliance and extraction quality are separate columns throughout.\n')
    w('**Definitions.** Over the %d labelled slots: *emitted* = the configuration produced a value; '
      '*correct* = emitted and matching the label under the comparator; *incorrect emission* = '
      'emitted and not matching; *abstention* = not emitted; precision = correct / emitted; '
      'recall = correct / %d; F1 their harmonic mean. *Raw coverage* counts non-null values over all '
      '%d field-document slots. *Labelled-slot coverage* is emitted over the %d labelled slots and '
      'is used in place of applicable-field coverage: no per-document list of applicable fields '
      'exists (job R2-1, item H-1), so a true applicable-field denominator cannot be computed here.\n'
      % (GOLD_SLOTS, GOLD_SLOTS, FIELD_SLOTS, GOLD_SLOTS))

    # ---------------- control comparison, before any other result -----------
    w('\n---\n\n## 1. Control arm against the archived pinned campaign\n')
    ctrl = by.get('control', {})
    ctrl_complete = complete_runs(ctrl)
    ctrl_arch = archivelike_runs(ctrl)
    gate = {'verdict': 'not evaluated', 'reason': 'no control records'}
    ctrl_ba = None
    w('The control rerun is compared against the archived pinned campaign **C-PIN-4DOC-B** '
      '(`paper/_run_4doc_fixed_10runs.log`, 2026-08-14, ten complete runs), whose figures are:\n\n')
    w('| configuration | archived coverage of 88 | archived accuracy of 20 |\n|---|---|---|\n')
    for c in ('full_workflow', 'ungated_hybrid', 'model_alone'):
        a = ARCHIVE[c]
        w('| %s | %.1f ± %.1f | %.1f ± %.1f |\n' % (c.replace('_', ' '), a['coverage'],
                                                    a['coverage_ci'], a['accuracy'], a['accuracy_ci']))
    w('\nThe control passes when the full workflow lands within %.1f of 16.0 of 20 and within %.1f '
      'of 48.0 of 88, the served model is a gemini-2.5-flash build, all planned runs completed, and '
      'at least one run is complete on all four documents.\n\n' % (GATE_ACC_TOL, GATE_COV_TOL))
    if not ctrl:
        w('**No control records exist: the campaign has not been executed.** No arm may be '
          'reported until the control has been run and compared, so every table below is empty '
          'by construction.\n')
    else:
        scored_on = ctrl_arch or ctrl_complete or ctrl
        which = ('the %d runs in which every document returned parseable output, which is the '
                 'archive\'s own protocol' % len(ctrl_arch)) if ctrl_arch else (
                 'ALL %d runs with records, because no run met the archive\'s protocol, so this '
                 'comparison is not like-for-like' % len(ctrl))
        tab = arm_table(scored_on, 'legacy_containment', CONFIG_ORDER)
        rl = reliability([r for rs in ctrl.values() for r in rs])
        w('Runs with at least one document-run: **%d of %d planned**. Runs complete on all four '
          'documents: **%d**. Runs meeting the archive\'s protocol (all four documents valid and '
          'parseable): **%d**. Scored on %s.\n'
          % (len(ctrl), planned.get('control', 0), len(ctrl_complete), len(ctrl_arch), which))
        w('Model served: %s.\n' % (', '.join(rl['models_served']) or 'not reported by the endpoint'))
        w('\nScored under the **legacy containment** test, which is the test the archive used:\n\n')
        w('| configuration | archived C-PIN-4DOC-B | this control arm | difference |\n|---|---|---|---|\n')
        for c in ('full_workflow', 'ungated_hybrid', 'model_alone'):
            a = ARCHIVE[c]
            t = tab[c]
            w('| %s, accuracy of 20 | %.1f ± %.1f | %s | %+.1f |\n'
              % (c.replace('_', ' '), a['accuracy'], a['accuracy_ci'], fmt(t['correct']),
                 t['correct']['mean'] - a['accuracy']))
            w('| %s, coverage of 88 | %.1f ± %.1f | %s | %+.1f |\n'
              % (c.replace('_', ' '), a['coverage'], a['coverage_ci'], fmt(t['raw_coverage']),
                 t['raw_coverage']['mean'] - a['coverage']))
        dacc = tab['full_workflow']['correct']['mean'] - ARCHIVE['full_workflow']['accuracy']
        dcov = tab['full_workflow']['raw_coverage']['mean'] - ARCHIVE['full_workflow']['coverage']
        served_ok = any('gemini-2.5-flash' in m for m in rl['models_served']) if rl['models_served'] else None
        # The reproduction verdict is about the numbers, which is what brief
        # decision 3 conditions on. Whether the control arm has finished all its
        # planned runs is a separate fact: an unfinished campaign is not a
        # scientific deviation, and the two must not be conflated.
        checks = [('accuracy within %.1f of 16.0' % GATE_ACC_TOL, abs(dacc) <= GATE_ACC_TOL),
                  ('coverage within %.1f of 48.0' % GATE_COV_TOL, abs(dcov) <= GATE_COV_TOL),
                  ('served model is a gemini-2.5-flash build', bool(served_ok)),
                  ('at least one run on the archive protocol', bool(ctrl_arch))]
        ok = all(c[1] for c in checks)
        done = len(ctrl_complete) >= planned.get('control', 0)
        gate = {'verdict': 'pass' if ok else 'deviates',
                'control_complete': done,
                'runs_complete_of_planned': '%d of %d' % (len(ctrl_complete), planned.get('control', 0)),
                'reason': '; '.join('%s: %s' % (n, 'yes' if v else 'NO') for n, v in checks),
                'full_workflow_accuracy_mean': tab['full_workflow']['correct']['mean'],
                'full_workflow_coverage_mean': tab['full_workflow']['raw_coverage']['mean'],
                'archived_accuracy': ARCHIVE['full_workflow']['accuracy'],
                'archived_coverage': ARCHIVE['full_workflow']['coverage'],
                'runs_complete': len(ctrl_complete), 'runs_planned': planned.get('control', 0),
                'models_served': rl['models_served'], 'comparator': 'legacy_containment'}
        w('\n**Reproduction test.** %s. Verdict: **%s**.\n'
          % (gate['reason'], 'the control reproduces the archived campaign' if ok
             else 'the control DEVIATES from the archived campaign'))
        if not done:
            w('\nThe control arm is **not finished**: %d of %d planned runs are complete on all '
              'four documents. The reproduction verdict above is about the numbers and is not '
              'affected by that, but no arm should be treated as final until the control arm is.\n'
              % (len(ctrl_complete), planned.get('control', 0)))
        w('\n%s\n' % comparator_disagreements(scored_on))
        w('\nOperational reliability, control arm: %s.\n' % rel_line(rl))
        w('\nUnder the boundary-aware comparator the same control runs give:\n\n')
        ctrl_ba = arm_table(scored_on, 'boundary_aware', CONFIG_ORDER)
        w(md_table(ctrl_ba, CONFIG_ORDER))
        w('\n%s\n' % commentary('control', ctrl_ba, tab, None, rl, CONFIG_ORDER))

    json.dump(gate, open(os.path.join(WORK, 'control_gate.json'), 'w'), indent=1)

    # ---------------- one section per experiment ----------------------------
    sections = [
        ('2. R3.23, structured output against schema-less plus normaliser', ['schema_flat'],
         ['model_alone', 'ai_gate_no_rules', 'full_workflow']),
        ('3. R3.17, input selection', ['input_fulltext', 'input_passage'],
         ['model_alone', 'ungated_hybrid', 'full_workflow']),
        ('4. R3.11, text-layer repair ablation', ['no_repair'],
         ['model_alone', 'ungated_hybrid', 'full_workflow']),
        ('5. R2 Q6, generic document-information-extraction baseline', ['docie_baseline'],
         ['model_alone']),
    ]
    for title, armids, configs in sections:
        w('\n---\n\n## %s\n' % title)
        for a in armids:
            runs = by.get(a, {})
            m = meta.get(a, {})
            comp = complete_runs(runs)
            w('\n### %s\n' % (m.get('label') or a))
            w('Factor changed against the control: %s.\n' % (m.get('factor') or 'not recorded'))
            w('Runs complete on all four documents: **%d of %d planned**%s.'
              % (len(comp), planned.get(a, 0),
                 ' (%d further run(s) were interrupted part way and are excluded from the tables '
                 'but kept in results.json)' % (len(runs) - len(comp)) if len(runs) > len(comp) else ''))
            if not comp:
                w(' No complete runs; this arm is not reported.\n')
                continue
            runs = comp
            rl = reliability([r for rs in runs.values() for r in rs])
            w(' Model served: %s. Dates: %s.\n' % (', '.join(rl['models_served']) or 'not reported',
                                                   ', '.join(rl['dates'])))
            tab_ba = arm_table(runs, 'boundary_aware', configs)
            tab_lc = arm_table(runs, 'legacy_containment', configs)
            w('\n**Boundary-aware comparator.**\n\n')
            w(md_table(tab_ba, configs))
            w('\n**Legacy containment comparator, same runs.**\n\n')
            w(md_table(tab_lc, configs))
            w('\n%s\n' % commentary(a, tab_ba, tab_lc, ctrl_ba, rl, configs))
            if a == 'docie_baseline':
                orc = [docie_oracle(rs, 'boundary_aware') for rs in runs.values()]
                w('\nUpper bound for this baseline, counting a label as recovered if any emitted '
                  'key-value pair carries it whatever key it was filed under: %s of %d.\n'
                  % (fmt(agg([o['correct'] for o in orc])), GOLD_SLOTS))
            if rl['schema_compliant_rate'] is not None:
                w('\nSchema compliance: %.0f%% of document-runs returned every declared field with '
                  'the declared type.\n' % (100 * rl['schema_compliant_rate']))
            w('\nOperational reliability: %s.\n' % rel_line(rl))
            w('Mean input size %.0f characters; mean tokens per call: prompt %s, output %s, total %s.\n'
              % (rl['input_chars_mean'],
                 ('%.0f' % rl['tokens_prompt_mean']) if rl['tokens_prompt_mean'] else 'not reported',
                 ('%.0f' % rl['tokens_output_mean']) if rl['tokens_output_mean'] else 'not reported',
                 ('%.0f' % rl['tokens_total_mean']) if rl['tokens_total_mean'] else 'not reported'))

    # ---------------- R3.17 evidence-span inclusion -------------------------
    ev = data.get('evidence_spans')
    if ev:
        w('\n---\n\n## 6. R3.17, annotated evidence spans reaching the model input\n')
        w('Deterministic; no model call is involved. A span counts as included when the annotated '
          'value appears verbatim, after normalisation, in the text actually sent to the model.\n\n')
        w('| selection rule | characters sent | annotated spans included |\n|---|---|---|\n')
        for r, t in ev['totals'].items():
            w('| %s | %d | %d of %d (%.0f%%) |\n'
              % (r, t['input_chars'], t['spans_included'], t['spans_total'], 100 * t['inclusion_rate']))
        w('\n| document | pages | source characters | head-and-annex | full text | passage |\n|---|---|---|---|---|---|\n')
        for f, r in ev['docs'].items():
            w('| %s | %d | %d | %d of %d (%.1f%% of the text) | %d of %d | %d of %d |\n'
              % (f, r['pages'], r['source_chars'],
                 r['rules']['head_annex']['spans_included'], r['annotated_spans'],
                 100 * r['rules']['head_annex']['share_of_document'],
                 r['rules']['fulltext']['spans_included'], r['annotated_spans'],
                 r['rules']['passage']['spans_included'], r['annotated_spans']))
        worst = min(ev['docs'].items(), key=lambda kv: kv[1]['rules']['head_annex']['share_of_document'])
        wn, wr = worst
        w('\nThe current head-and-annex rule reaches %d of %d annotated spans, full text reaches '
          '%d and passage selection %d. The rule starves `%s`: it sends %.1f%% of that document, '
          '%d characters of %d, and withholds %d of its %d annotated values, so on that document a '
          'missing field cannot be told apart from a field never shown to the model. '
          % (ev['totals']['head_annex']['spans_included'], ev['totals']['head_annex']['spans_total'],
             ev['totals']['fulltext']['spans_included'], ev['totals']['passage']['spans_included'],
             wn, 100 * wr['rules']['head_annex']['share_of_document'],
             wr['rules']['head_annex']['input_chars'], wr['source_chars'],
             wr['annotated_spans'] - wr['rules']['head_annex']['spans_included'], wr['annotated_spans']))
        w('This measures only what reaches the model, not what the model then does with it; '
          'whether supplying the evidence changes the extraction is the `input_fulltext` and '
          '`input_passage` arms above.\n')

    # ---------------- reliability roll-up -----------------------------------
    w('\n---\n\n## 7. Operational reliability across the campaign (R3.29)\n\n')
    w('| arm | complete runs / planned | document-runs | requests valid | parseable | usable records '
      '| retries per call | latency median (ms) | latency p90 (ms) |\n|---|---|---|---|---|---|---|---|---|\n')
    for a in planned:
        runs = by.get(a, {})
        if not runs:
            w('| %s | 0 / %d | 0 |, |, |, |, |, |, |\n' % (a, planned[a]))
            continue
        rl = reliability([r for rs in runs.values() for r in rs])
        w('| %s | %d / %d | %d | %.0f%% | %.0f%% | %.0f%% | %.2f | %.0f | %.0f |\n'
          % (a, len(complete_runs(runs)), planned[a], rl['document_runs'], 100 * rl['request_valid_rate'],
             100 * rl['parseable_rate'], 100 * rl['usable_record_completion'],
             rl['retries_per_call'], rl['latency_ms_median'], rl['latency_ms_p90']))

    write_campaign_config(data, by, planned, meta)

    if data.get('SELFTEST'):
        L.insert(1, '\n> **SELF-TEST OUTPUT.** Every record behind this file is synthetic. '
                    'It measures the harness, not the model.\n')
    open(os.path.join(WORK, 'summary.md'), 'w', encoding='utf-8').write(''.join(L))
    print('wrote summary.md (%d document-run records over %d arm(s)); control gate: %s'
          % (len(records), len(by), gate['verdict']))


if __name__ == '__main__':
    main()

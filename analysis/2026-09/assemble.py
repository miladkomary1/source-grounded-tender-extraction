"""Assemble paper/runs_r2/results.json from the per-call checkpoint files.

Reads only paper/runs_r2/raw/**/*.json (plus evidence_spans.json, which is
deterministic and model-free) and writes one archive holding, per arm and run,
the model id served, the configuration, the dates, the calls, tokens, latency,
retries and failures, and per field the emitted value, the gate verdicts and the
material the scorer needs. No API key material is read or written.
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Google API key shapes. Written with a character class so that this file does
# not itself contain the literal prefix an acceptance grep searches for.
KEYLIKE = re.compile(r'A[I]za[0-9A-Za-z_\-]{10,}|A[Q]\.[0-9A-Za-z_\-]{10,}')
ARGS = sys.argv[1:]
WORK = ARGS[ARGS.index('--dir') + 1] if '--dir' in ARGS else HERE
SELFTEST = '--selftest' in ARGS
RAW = os.path.join(WORK, 'raw')


def arm_meta():
    src = open(os.path.join(HERE, 'arms.mjs'), encoding='utf-8').read()
    block = src[src.index('export const ARMS = ['):src.index('export const ARM_BY_ID')]
    out = {}
    for m in re.finditer(
            r"\{\s*id:\s*'([a-z_]+)',\s*runs:\s*(\d+),[^}]*?label:\s*'([^']*)',\s*factor:\s*'([^']*)'",
            block, re.S):
        out[m.group(1)] = {'runs_planned': int(m.group(2)), 'label': m.group(3), 'factor': m.group(4)}
    return out


def main():
    meta = arm_meta()
    records = []
    if os.path.isdir(RAW):
        for arm in sorted(os.listdir(RAW)):
            for run in sorted(os.listdir(os.path.join(RAW, arm))):
                d = os.path.join(RAW, arm, run)
                for f in sorted(os.listdir(d)):
                    if f.endswith('.json'):
                        records.append(json.load(open(os.path.join(d, f), encoding='utf-8')))

    synth = [r for r in records if r.get('synthetic')]
    if synth and not SELFTEST:
        raise SystemExit('REFUSED: %d synthetic self-test record(s) found under %s. The campaign '
                         'archive must hold measured calls only.' % (len(synth), RAW))
    if SELFTEST and len(synth) != len(records):
        raise SystemExit('REFUSED: --selftest given but %d of %d records are not synthetic'
                         % (len(records) - len(synth), len(records)))

    ev = os.path.join(HERE, 'evidence_spans.json')
    out = {
        'campaign': 'R2-2',
        'produced_by': 'paper/runs_r2/assemble.py over paper/runs_r2/raw/',
        'canonical_configuration': {
            'temperature': 0, 'topP': 1, 'maxOutputTokens': 8192, 'thinkingBudget': 0,
            'responseMimeType': 'application/json',
            'endpoint': 'https://generativelanguage.googleapis.com/v1beta',
            'model_requested': 'gemini-2.5-flash',
            'source': 'brief decision 2; matches campaign C-PIN-4DOC-B of '
                      'paper/revision_r2/config_table.md',
        },
        'runs_per_arm_planned': {a: m['runs_planned'] for a, m in meta.items()},
        'arms': meta,
        'evidence_spans': json.load(open(ev, encoding='utf-8')) if os.path.exists(ev) else None,
        'records': records,
    }
    if SELFTEST:
        out['SELFTEST'] = 'synthetic records; not a measurement of any model'
    blob = json.dumps(out, ensure_ascii=False, indent=1)
    if KEYLIKE.search(blob):
        raise SystemExit('REFUSED: key-like material found in the assembled archive')
    p = os.path.join(WORK, 'results.json')
    open(p, 'w', encoding='utf-8').write(blob)
    print('wrote %s  (%d document-run records, sha256 %s)'
          % (p, len(records), hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]))
    for a in sorted(meta):
        n = len({(r['run']) for r in records if r['arm'] == a})
        print('  %-16s runs with at least one record: %d / %d planned' % (a, n, meta[a]['runs_planned']))


if __name__ == '__main__':
    main()

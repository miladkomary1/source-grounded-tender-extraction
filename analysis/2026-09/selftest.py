"""Offline self-test of the R2-2 harness.

Runs every stage except the HTTP call: input selection, the gates, the
normaliser, the checkpoint format, resume, assembly, and the scorer. Responses
are fabricated deterministically and every record is stamped synthetic:true, so
nothing here can be mistaken for a measurement. Output goes to a directory
outside the campaign, given as the first argument.

  python selftest.py <workdir>
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from node_run import run_node  # noqa: E402

ARMS = ['control', 'schema_flat', 'input_fulltext', 'input_passage', 'no_repair', 'docie_baseline']
RUNS = 5          # enough to fire every fabricated branch, including a wrong value
DOCS = 4


def main(work):
    if os.path.abspath(work) == os.path.abspath(HERE):
        raise SystemExit('the self-test must not write into the campaign directory')
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    env = {'R2_OUT': work.replace('\\', '/'), 'R2_SYNTHETIC': '1'}
    fails = []

    for arm in ARMS:
        for run in range(1, RUNS + 1):
            p = run_node(os.path.join(HERE, 'run_arm.mjs'), ['--arm', arm, '--run', run],
                         timeout=300, env=env)
            if p.returncode != 0:
                fails.append('run_arm %s run %d exit %d: %s' % (arm, run, p.returncode, p.stderr[-800:]))
    print('stage 1 (runner): %d arm-runs, %d failure(s)' % (len(ARMS) * RUNS, len(fails)))

    n = sum(len(os.listdir(os.path.join(work, 'raw', a, r)))
            for a in os.listdir(os.path.join(work, 'raw'))
            for r in os.listdir(os.path.join(work, 'raw', a)))
    if n != len(ARMS) * RUNS * DOCS:
        fails.append('expected %d checkpoint files, found %d' % (len(ARMS) * RUNS * DOCS, n))

    # resume must be a no-op
    p = run_node(os.path.join(HERE, 'run_arm.mjs'), ['--arm', 'control', '--run', '1'],
                 timeout=300, env=env)
    if 'wrote 0' not in p.stdout:
        fails.append('resume rewrote existing checkpoints: %s' % p.stdout.strip()[-200:])
    else:
        print('stage 2 (resume): re-running a completed batch wrote nothing, as intended')

    # assembly must refuse synthetic records unless told
    r = subprocess.run([sys.executable, os.path.join(HERE, 'assemble.py'), '--dir', work],
                       capture_output=True, text=True)
    if r.returncode == 0:
        fails.append('assemble.py accepted synthetic records without --selftest')
    else:
        print('stage 3 (guard): assemble.py refused synthetic records, as intended')

    r = subprocess.run([sys.executable, os.path.join(HERE, 'assemble.py'), '--dir', work, '--selftest'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append('assemble.py --selftest failed: %s' % r.stderr[-800:])
    else:
        print('stage 4 (assemble): ' + r.stdout.strip().splitlines()[0])

    r = subprocess.run([sys.executable, os.path.join(HERE, 'score.py'), '--dir', work],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append('score.py failed: %s' % r.stderr[-1500:])
    else:
        print('stage 5 (score): ' + r.stdout.strip())

    # determinism: scoring twice from the same archive must give the same file
    s1 = open(os.path.join(work, 'summary.md'), encoding='utf-8').read()
    subprocess.run([sys.executable, os.path.join(HERE, 'score.py'), '--dir', work],
                   capture_output=True, text=True)
    s2 = open(os.path.join(work, 'summary.md'), encoding='utf-8').read()
    if s1 != s2:
        fails.append('score.py is not deterministic over the same archive')
    else:
        print('stage 6 (determinism): scoring twice from results.json gave an identical summary.md')

    # the archive must be sufficient on its own: scoring with raw/ removed must work
    iso = os.path.join(work, 'isolated')
    os.makedirs(iso, exist_ok=True)
    shutil.copy(os.path.join(work, 'results.json'), os.path.join(iso, 'results.json'))
    r = subprocess.run([sys.executable, os.path.join(HERE, 'score.py'), '--dir', iso],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append('score.py could not run from results.json alone: %s' % r.stderr[-800:])
    elif open(os.path.join(iso, 'summary.md'), encoding='utf-8').read() != s1:
        fails.append('scoring from results.json alone gave a different summary.md')
    else:
        print('stage 7 (self-sufficiency): results.json alone reproduced summary.md byte for byte')

    d = json.load(open(os.path.join(work, 'results.json'), encoding='utf-8'))
    rec = d['records'][0]
    for k in ('model_served', 'generation_config', 'started_at', 'call', 'parse', 'fields', 'gold'):
        if k not in rec:
            fails.append('record is missing %s' % k)
    f = next(iter(rec['fields'].values()))
    for k in ('raw', 'model_value', 'deterministic', 'grounded_strict', 'grounded_robust'):
        if k not in f:
            fails.append('field record is missing %s' % k)
    if not any(r['parse']['json_ok'] is False for r in d['records']):
        fails.append('self-test never exercised an unparseable response')
    if not any(r['call']['retries'] > 0 for r in d['records']):
        fails.append('self-test never exercised a retry')
    if not any(f['grounded_strict'] is False and f['model_value'] for r in d['records']
               for f in r['fields'].values()):
        fails.append('self-test never exercised an ungrounded emission')
    sc = [r['parse']['schema_compliant'] for r in d['records'] if r['arm'] == 'schema_flat']
    if not any(sc):
        fails.append('schema compliance never evaluated true on the schema arm')
    print('stage 8 (record shape): checked')

    # the scorer must actually count a wrong value as an incorrect emission, and
    # the two comparators must be able to disagree
    sys.path.insert(0, HERE)
    import score  # noqa: E402
    bad = any(score.run_metrics(rs, 'model_alone', 'boundary_aware')['incorrect_emission'] > 0
              for a in ARMS for rs in [[r for r in d['records'] if r['arm'] == a and r['run'] == n]
                                       for n in range(1, RUNS + 1)] if rs)
    if not bad:
        fails.append('the scorer never recorded an incorrect emission, so that column is untested')
    else:
        print('stage 9 (incorrect emission): a wrong value was counted as an incorrect emission')
    probes = [('15%', '5%'), ('124 MESES', '24 MESES'), ('121%', '21%'), ('contrato de obras', 'obras')]
    disagree = [(s, g) for s, g in probes
                if score.scored_correct(s, g) != score.strict_correct(s, g)]
    if len(disagree) != 3:
        fails.append('comparator probe: expected the two comparators to disagree on the three '
                     'numeric probes and agree on the categorical one, got %r' % (disagree,))
    else:
        print('stage 10 (comparators): boundary-aware rejects 15%/5%, 124/24 MESES and 121%/21%, '
              'which containment accepts, and both accept "obras" inside "contrato de obras"')

    print('\n' + ('SELF-TEST PASSED' if not fails else 'SELF-TEST FAILED'))
    for f_ in fails:
        print('  - ' + f_)
    return 1 if fails else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '_selftest')))

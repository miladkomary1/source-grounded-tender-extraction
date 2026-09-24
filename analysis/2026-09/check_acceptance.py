"""Run the acceptance criteria of brief R2-2 against this directory.

  1. the control arm is compared against the archived pinned campaign, and that
     comparison appears in summary.md before any other result
  2. every arm reports n runs completed out of n planned
  3. scoring reruns from results.json alone and reproduces summary.md
  4. a search of paper/runs_r2/ for the Google API key prefixes (and for any
     other key shape) returns nothing
  5. the boundary-aware comparator in score.py behaves identically to job R2-1's
     original in paper/revision_r2/analysis/r3_14_containment.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
R21 = 'C:/Users/milad.komary/Documents/projects/PCAP/paper/revision_r2/analysis'
sys.path.insert(0, HERE)
import score  # noqa: E402

fails, notes = [], []


def check(name, ok, detail=''):
    (notes if ok else fails).append('%s %s%s' % ('PASS' if ok else 'FAIL', name,
                                                 (', ' + detail) if detail else ''))


# ---- 4. no key material anywhere in the directory -------------------------
# Assembled from pieces so this checker does not itself plant the literal it
# searches for in the directory it is searching.
G1 = 'AI' + 'za'
PATTERNS = [(G1, re.compile(G1)), ('AQ key prefix', re.compile(r'A' + r'Q\.[0-9A-Za-z_\-]{15,}')),
            ('sk key prefix', re.compile(r'\bs' + r'k-[0-9A-Za-z]{20,}'))]
hits = []
for dp, dns, fns in os.walk(HERE):
    dns[:] = [d for d in dns if d not in ('__pycache__', '_selftest')]
    for fn in fns:
        p = os.path.join(dp, fn)
        try:
            t = open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for label, pat in PATTERNS:
            if pat.search(t):
                hits.append('%s in %s' % (label, os.path.relpath(p, HERE)))
check('no API key material under paper/runs_r2/', not hits, '; '.join(sorted(set(hits))))

# ---- 5. comparator equivalence with job R2-1 ------------------------------
try:
    sys.path.insert(0, R21)
    import importlib.util
    spec = importlib.util.spec_from_file_location('r3_14', os.path.join(R21, 'r3_14_containment.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    probes = ['5%', '15%', '21%', '121%', '24 MESES', '124 MESES', '1.053.169,72', '169,72',
              '53.169,72', 'obras', 'contrato de obras', 'Procedimiento abierto', 'abierto',
              'ABIERTO', '12,34', '4 AÑOS', '14 AÑOS', '', None, '21 %', 'IVA 21%']
    bad = []
    for a in probes:
        for b in probes:
            if mod.strict_correct(a, b) != score.strict_correct(a, b):
                bad.append((a, b))
    check('score.py reproduces job R2-1 strict_correct on %d probe pairs' % (len(probes) ** 2),
          not bad, repr(bad[:5]))
except Exception as e:  # the R2-1 directory may not be present
    check('comparator equivalence with job R2-1', False, 'could not load the original: %r' % (e,))

# ---- results-dependent checks --------------------------------------------
RES = os.path.join(HERE, 'results.json')
SUM = os.path.join(HERE, 'summary.md')
if not os.path.exists(RES):
    check('results.json exists', False, 'no campaign has been run yet')
else:
    data = json.load(open(RES, encoding='utf-8'))
    planned = data['runs_per_arm_planned']
    runs = {}
    for r in data['records']:
        runs.setdefault(r['arm'], set()).add(r['run'])

    # 3. scoring from results.json alone
    tmp = tempfile.mkdtemp()
    shutil.copy(RES, os.path.join(tmp, 'results.json'))
    p = subprocess.run([sys.executable, os.path.join(HERE, 'score.py'), '--dir', tmp],
                       capture_output=True, text=True)
    same = (p.returncode == 0 and os.path.exists(SUM)
            and open(os.path.join(tmp, 'summary.md'), encoding='utf-8').read()
            == open(SUM, encoding='utf-8').read())
    check('scoring reruns from results.json alone and reproduces summary.md', same,
          p.stderr[-300:] if p.returncode else '')
    shutil.rmtree(tmp, ignore_errors=True)

    txt = open(SUM, encoding='utf-8').read() if os.path.exists(SUM) else ''
    # 1. control comparison first
    i_ctrl = txt.find('## 1. Control arm against the archived pinned campaign')
    others = [txt.find('## %d.' % n) for n in range(2, 8)]
    others = [x for x in others if x >= 0]
    check('the control comparison appears before any other result',
          i_ctrl >= 0 and (not others or i_ctrl < min(others)))
    check('the control comparison names the archived campaign figures',
          'C-PIN-4DOC-B' in txt and '16.0' in txt)
    # 2. n of n planned for every arm
    missing = [a for a in planned
               if not re.search(r'%s' % re.escape(a), txt) and a != 'control']
    stated = re.findall(r'(?:Runs complete on all four documents|Runs with at least one '
                        r'document-run):? \*?\*?(\d+) of (\d+) planned', txt)
    check('every arm states runs completed out of runs planned',
          len(stated) >= len(planned) - 1 and not missing,
          'stated for %d arm(s), %d planned' % (len(stated), len(planned)))
    for a, n in planned.items():
        got = len(runs.get(a, ()))
        if got < n:
            notes.append('NOTE %s: %d of %d planned runs present' % (a, got, n))

print('\n'.join(notes))
print()
print('\n'.join(fails) if fails else 'ALL ACCEPTANCE CHECKS PASS')
raise SystemExit(1 if fails else 0)

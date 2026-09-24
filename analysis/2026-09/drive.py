"""R2-2 campaign driver: chunked, resumable, control-arm-first.

Every invocation runs whole (arm, run) batches until its wall-clock budget is
spent, then exits, so no single command approaches the 9-minute ceiling. State
lives in the checkpoint files themselves (paper/runs_r2/raw/<arm>/runNN/*.json),
so a resume simply skips what is already on disk and no separate state file can
drift out of step with reality.

  python drive.py control            run the control arm only (brief decision 3)
  python drive.py rest               run every other arm; refuses until the
                                     control gate in control_gate.json passes
  python drive.py status             print what is done and what is pending

Options: --budget SECONDS (default 460), --arm ID (restrict to one arm).
"""
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from node_run import run_node  # noqa: E402

OUT = HERE.replace('\\', '/')
RAW = os.path.join(HERE, 'raw')
DOCS = 4  # the four labelled documents


def arms():
    """Read the arm list out of arms.mjs so there is one source of truth."""
    src = open(os.path.join(HERE, 'arms.mjs'), encoding='utf-8').read()
    block = src[src.index('export const ARMS = ['):src.index('export const ARM_BY_ID')]
    out = []
    for m in re.finditer(r"\{\s*id:\s*'([a-z_]+)',\s*runs:\s*(\d+)", block):
        out.append((m.group(1), int(m.group(2))))
    return out


def done_docs(arm, run):
    d = os.path.join(RAW, arm, 'run%02d' % run)
    if not os.path.isdir(d):
        return 0
    return len([f for f in os.listdir(d) if f.endswith('.json')])


def pending(selected=None):
    out = []
    for arm, runs in arms():
        if selected and arm != selected:
            continue
        for r in range(1, runs + 1):
            if done_docs(arm, r) < DOCS:
                out.append((arm, r))
    return out


def status():
    tot_done = tot_plan = 0
    for arm, runs in arms():
        complete = sum(1 for r in range(1, runs + 1) if done_docs(arm, r) >= DOCS)
        calls = sum(done_docs(arm, r) for r in range(1, runs + 1))
        tot_done += calls
        tot_plan += runs * DOCS
        print('%-16s runs complete %2d/%-2d   document-runs on disk %3d/%d'
              % (arm, complete, runs, calls, runs * DOCS))
    print('TOTAL document-runs %d/%d' % (tot_done, tot_plan))
    g = os.path.join(HERE, 'control_gate.json')
    print('control gate:', json.load(open(g))['verdict'] if os.path.exists(g) else 'not evaluated')


def quota_hold():
    """Refuse to make a call while a recorded quota pause is still running.

    quota_state.json is written whenever both keys return 429. It carries the
    time the allowance resets, so the pause is enforced by the driver rather than
    remembered by whoever runs it."""
    p = os.path.join(HERE, 'quota_state.json')
    if not os.path.exists(p):
        return None
    s = json.load(open(p))
    if not s.get('not_before'):
        return None
    import datetime
    nb = datetime.datetime.fromisoformat(s['not_before'])
    now = datetime.datetime.now(nb.tzinfo)
    if now < nb:
        return ('quota pause in force until %s (%s from now). Recorded %s.'
                % (s['not_before'], str(nb - now).split('.')[0], s.get('recorded_at', '?')))
    return None


def record_quota_stop(not_before_iso, detail=''):
    import datetime
    json.dump({'not_before': not_before_iso,
               'recorded_at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
               'detail': detail,
               'completed_at_stop': {a: sum(1 for r in range(1, n + 1) if done_docs(a, r) >= DOCS)
                                     for a, n in arms()}},
              open(os.path.join(HERE, 'quota_state.json'), 'w'), indent=1)


def gate_ok():
    g = os.path.join(HERE, 'control_gate.json')
    if not os.path.exists(g):
        return False, 'control_gate.json does not exist; run score.py after the control arm'
    v = json.load(open(g))
    if v.get('verdict') != 'pass':
        return False, 'the control does not reproduce the archive: %s' % v.get('reason', '')
    if not v.get('control_complete'):
        return False, ('the control reproduces the archive, but the control arm is unfinished '
                       '(%s runs). Finish it first.' % v.get('runs_complete_of_planned', '?'))
    return True, ''


def drive(which, budget, only=None):
    hold = quota_hold()
    if hold:
        print('REFUSED: %s' % hold)
        return 6
    if which == 'rest':
        ok, why = gate_ok()
        if not ok:
            print('REFUSED: the control arm has not been shown to reproduce the archived '
                  'pinned campaign. %s' % why)
            return 5
        todo = [t for t in pending(only) if t[0] != 'control']
    elif which == 'control':
        todo = [t for t in pending('control')]
    else:
        todo = pending(only)
    if not todo:
        print('nothing pending for "%s"' % which)
        return 0
    t_end = time.time() + budget
    ran = 0
    # A batch is four calls; at free-tier pacing each is roughly 30 s, so a batch
    # needs about two minutes. Never start one the budget cannot finish: a batch
    # killed mid-flight wastes the quota of the calls it had already made.
    batch_seconds = int(os.environ.get('R2_BATCH_SECONDS', '170'))
    for arm, run in todo:
        left = int(t_end - time.time())
        if left < batch_seconds:
            print('budget reached; %d batch(es) still pending' % (len(todo) - ran))
            break
        print('--- %s run %d (%d s left in this invocation) ---' % (arm, run, left))
        try:
            p = run_node(os.path.join(HERE, 'run_arm.mjs'),
                         ['--arm', arm, '--run', run], timeout=left)
        except subprocess.TimeoutExpired:
            print('batch timed out; completed documents are checkpointed and will be skipped '
                  'on resume, the rest will be retried')
            return 0
        sys.stdout.write(p.stdout)
        if p.stderr.strip():
            sys.stderr.write(p.stderr[-2000:])
        ran += 1
        if p.returncode == 3:
            import datetime
            import zoneinfo
            pt = datetime.datetime.now(zoneinfo.ZoneInfo('America/Los_Angeles'))
            reset = (pt + datetime.timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)
            record_quota_stop(reset.astimezone().isoformat(timespec='seconds'), p.stdout[-600:])
            print('QUOTA EXHAUSTED. Stopping cleanly. Completed batches are on disk.')
            print('Allowance resets at 00:00 Pacific; recorded a hold until %s local. '
                  'Runs complete per arm at the stop:' % reset.astimezone().isoformat(timespec='minutes'))
            for a, n in arms():
                print('  %-16s %d / %d' % (a, sum(1 for r in range(1, n + 1) if done_docs(a, r) >= DOCS), n))
            return 3
        if p.returncode == 4:
            print('NO KEY: GKEY/GKEY2/GKEY3 are unset in this environment. Nothing was run.')
            return 4
        if p.returncode != 0:
            print('batch failed with exit %d; stopping so the cause can be read' % p.returncode)
            return p.returncode
    print('invocation finished: %d batch(es) executed' % ran)
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'):
        print(__doc__)
        raise SystemExit(2)
    cmd = a[0]
    budget = int(a[a.index('--budget') + 1]) if '--budget' in a else 460
    only = a[a.index('--arm') + 1] if '--arm' in a else None
    if cmd == 'status':
        status()
        raise SystemExit(0)
    raise SystemExit(drive(cmd, budget, only))

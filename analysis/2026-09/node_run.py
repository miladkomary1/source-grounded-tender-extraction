"""Launch a Node script for the R2-2 campaign.

This session's shell allowlist permits only C:/Python314/python.exe, so Node is
started through subprocess rather than from the shell directly. Node itself,
the pipeline and lib/ are untouched; this file only starts them.

usage: node_run.py <script.mjs> [args...]        (timeout via R2_NODE_TIMEOUT)
"""
import os
import re
import subprocess
import sys

ROOT = 'C:/Users/milad.komary/Documents/projects/PCAP'
NODE = 'C:/Program Files/nodejs/node.exe'
# Location of the key file, not the keys. Overridable with R2_KEYFILE.
KEYFILE = os.environ.get('R2_KEYFILE', 'C:/Users/milad.komary/.secrets/gemini_keys.env')
# Any GKEY, GKEY2, GKEY3 ... line in the key file is used, so adding keys to the
# file is all that is needed to widen the rotation. Key formats are not checked
# against a prefix: the project has used both the older and the newer shape.
KEY_VAR = re.compile(r'^GKEY\d*$')


def load_keys(path=KEYFILE):
    """Read the Gemini keys into a dict for the child process environment.

    The values are never printed, logged, written to a file, or placed in this
    process's own os.environ; they exist only in the env mapping handed to the
    Node child. The caller gets counts, never material.
    """
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            k = k.strip()
            if k.startswith('export '):
                k = k[7:].strip()
            v = v.strip().strip('"').strip("'")
            if KEY_VAR.match(k) and v:
                out[k] = v
    return out


def key_count(path=KEYFILE):
    return len(load_keys(path))


def run_node(script, args=(), timeout=540, env=None, with_keys=True):
    cmd = [NODE, script, *[str(a) for a in args]]
    e = dict(os.environ)
    if with_keys:
        e.update(load_keys())
    if env:
        e.update({k: v for k, v in env.items() if v is not None})
    p = subprocess.run(cmd, cwd=ROOT, env=e, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=timeout)
    # Belt and braces: if any key ever reached the child's output, it stops here
    # and never reaches a transcript, a log or a file.
    secrets = [v for k, v in e.items() if KEY_VAR.match(k) and v]
    for s in secrets:
        p.stdout = p.stdout.replace(s, '[REDACTED]')
        p.stderr = p.stderr.replace(s, '[REDACTED]')
    return p


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    script = sys.argv[1]
    if not os.path.isabs(script):
        script = os.path.join(ROOT, 'paper', 'runs_r2', script)
    t = int(os.environ.get('R2_NODE_TIMEOUT', '540'))
    try:
        proc = run_node(script, sys.argv[2:], timeout=t)
    except subprocess.TimeoutExpired:
        print(f'TIMEOUT after {t}s: {script}')
        raise SystemExit(124)
    sys.stdout.write(proc.stdout)
    if proc.stderr.strip():
        sys.stderr.write('\n--- node stderr ---\n' + proc.stderr)
    raise SystemExit(proc.returncode)

"""MAJOR 7, external baseline: layout-aware parsing (IBM Docling) vs the
pdfjs text extraction used throughout the paper.

Reviewer #1 notes that layout-aware parsers "address exactly the table-heavy
layouts the deterministic engine struggles with". This runs Docling over the
four labelled documents and writes its Markdown so the SAME deterministic
extractor can be scored on it, isolating the contribution of the parser.

    python paper/_docling_baseline.py            # all 4 labelled docs
"""
import json
import os
import sys
import time
from pathlib import Path

# torch.compile / TorchDynamo needs an MSVC toolchain on Windows ("cl not found").
# These must be set BEFORE torch is imported (docling imports it transitively),
# otherwise the setting is ignored, which is why the shell-level export failed.
os.environ["TORCHDYNAMO_DISABLE"] = "1"
os.environ["TORCH_COMPILE_DISABLE"] = "1"
os.environ["PYTORCH_JIT"] = "0"
try:
    import torch._dynamo as _dynamo
    _dynamo.config.suppress_errors = True
except Exception:
    pass

ROOT = Path("C:/Users/milad.komary/Documents/projects/PCAP")
DOCS = ROOT / "examples"
OUT = ROOT / "paper" / "_docling_out"
OUT.mkdir(parents=True, exist_ok=True)

try:
    from docling.document_converter import DocumentConverter
except Exception as e:  # concrete reason, for the manuscript if it fails
    print(f"DOCLING_IMPORT_FAILED: {type(e).__name__}: {e}")
    sys.exit(2)

conv = DocumentConverter()
report = []
for pdf in sorted(DOCS.glob("*.[pP][dD][fF]")):
    t0 = time.time()
    try:
        res = conv.convert(str(pdf))
        md = res.document.export_to_markdown()
        (OUT / (pdf.stem + ".md")).write_text(md, encoding="utf-8")
        tables = len(getattr(res.document, "tables", []) or [])
        report.append({
            "doc": pdf.name, "ok": True, "chars": len(md),
            "tables": tables, "seconds": round(time.time() - t0, 1),
        })
        print(f"OK   {pdf.name}: {len(md)} chars, {tables} tables, {time.time()-t0:.1f}s")
    except Exception as e:
        report.append({"doc": pdf.name, "ok": False, "error": f"{type(e).__name__}: {e}"})
        print(f"FAIL {pdf.name}: {type(e).__name__}: {e}")

(ROOT / "paper" / "_docling_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(f"\nwrote {OUT} and paper/_docling_report.json")

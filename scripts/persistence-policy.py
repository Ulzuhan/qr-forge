#!/usr/bin/env python3
"""Conservative image-only lane: persistence edits require manual migration review."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE_SOURCE = "cee4e785b9b2475422b906a7180ad0693156a49d"


def verify(root=ROOT):
    policy = json.loads((root / "release/persistence-policy.json").read_text())
    if policy["baseline_source"] != BASELINE_SOURCE or policy["data_action"] != "image-only":
        raise ValueError("persistence policy requires manual review")
    paths = {p.relative_to(root).as_posix() for p in (root / "internal/store").rglob("*")
             if p.is_file() and (p.suffix in {".go", ".sql"}) and not p.name.endswith("_test.go")}
    paths.add("cmd/qrforge/main.go")
    if paths != set(policy["files"]):
        raise ValueError("persistence file set changed: manual migration review required")
    for name, digest in policy["files"].items():
        path = root / name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("persistence/startup changed: manual migration and return review required: " + name)


if __name__ == "__main__":
    try:
        verify()
        print("qrforge-sqlite-v1: frozen persistence/startup; image-only return")
    except (ValueError, OSError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Fast PRTOE environment check — no cosmology compute."""
from __future__ import annotations

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    print("=== PRTOE environment check ===")
    print(f"Python: {sys.version.split()[0]} ({sys.executable})")

    class_bin = os.path.join(ROOT, "class")
    if os.path.isfile(class_bin) and os.access(class_bin, os.X_OK):
        print(f"CLASS binary: OK ({class_bin})")
    else:
        print("CLASS binary: MISSING — run: make -j4 class")
        return 1

    try:
        import classy  # noqa: F401

        classy_path = getattr(classy, "__file__", None) or "import ok"
        print(f"classy extension: OK ({classy_path})")
    except ImportError as exc:
        tag = f"cpython-{sys.version_info.major}{sys.version_info.minor}"
        print(f"classy extension: MISSING for {tag} ({exc})")
        print("  Fix: conda activate pgtoe_gold && cd ~/prtoe_class && make classy")

    r = subprocess.run(
        [class_bin, "test_prtoe_bg_only.ini"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode == 0:
        print("test_prtoe_bg_only.ini: PASS")
    else:
        print(f"test_prtoe_bg_only.ini: FAIL (exit {r.returncode})")
        if r.stderr:
            print(r.stderr[-400:])
        return 1

    print("Environment OK for background-only CLASS runs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
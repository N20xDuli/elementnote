"""Build a clean AMO/Firefox XPI from the extension source.

Usage:
    python tools/build_amo_xpi.py <extension-dir> <output.xpi>

Only manifest.json, src/ and icons/ are packed; docs/demo/tests/store are
excluded. ZIP entries use forward slashes, which Firefox requires.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import zipfile


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python tools/build_amo_xpi.py <extension-dir> <output.xpi>")
        return 2
    root = os.path.abspath(sys.argv[1])
    out = os.path.abspath(sys.argv[2])
    required = ["manifest.json", "src", "icons"]
    for name in required:
        if not os.path.exists(os.path.join(root, name)):
            print(f"missing required path: {os.path.join(root, name)}")
            return 1

    with tempfile.TemporaryDirectory(prefix="elementnote-xpi-") as stage:
        for name in required:
            src = os.path.join(root, name)
            dst = os.path.join(stage, name)
            if os.path.isdir(src):
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out):
            os.remove(out)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for walk_root, _dirs, files in os.walk(stage):
                for name in files:
                    full = os.path.join(walk_root, name)
                    rel = os.path.relpath(full, stage).replace(os.sep, "/")
                    zf.write(full, rel)
    print(f"wrote {out}")
    with zipfile.ZipFile(out) as zf:
        print(f"entries: {len(zf.namelist())}")
        for name in zf.namelist()[:8]:
            print(" ", name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

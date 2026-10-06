"""Inventory PP 28/2025 annex uploads without extracting their entire corpus."""

import glob
import hashlib
from pathlib import Path
import sys

import pymupdf


def main():
    output = Path("/tmp/pp28-annex-review")
    output.mkdir(exist_ok=True)
    total = 0
    filenames = sys.argv[1:] or sorted(glob.glob("attached_assets/*179129285*.pdf"))
    for filename in filenames:
        digest = hashlib.sha256()
        with open(filename, "rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        with pymupdf.open(filename) as document:
            total += len(document)
            print(
                "FILE", Path(filename).name,
                "PAGES", len(document),
                "SHA256", digest.hexdigest(),
            )
            for number in sorted({0, len(document) - 1}):
                text = document[number].get_text()
                print("BOUNDARY", number + 1, " ".join(text.split())[:700])
            # First-page images allow inspection of table headings and sector titles.
            target = output / f"{Path(filename).stem}-first.png"
            document[0].get_pixmap(matrix=pymupdf.Matrix(1.1, 1.1)).save(
                str(target)
            )
            print("RENDER", target)
    print("TOTAL_PDF_PAGES", total)


if __name__ == "__main__":
    main()

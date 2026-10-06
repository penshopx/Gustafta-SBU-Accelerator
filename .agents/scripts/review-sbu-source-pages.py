"""Render explicitly selected source pages for human review; never activate rules."""

import argparse
from pathlib import Path

import pymupdf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("pages", nargs="+", type=int, help="One-based PDF pages")
    args = parser.parse_args()
    output = Path("/tmp/sbu-targeted-review")
    output.mkdir(exist_ok=True)
    with pymupdf.open(args.pdf) as document:
        for number in args.pages:
            if not 1 <= number <= len(document):
                parser.error(f"Page {number} outside 1..{len(document)}")
            page = document[number - 1]
            stem = f"{Path(args.pdf).stem}-p{number}"
            page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6)).save(
                str(output / f"{stem}.png")
            )
            text = page.get_text()
            (output / f"{stem}.txt").write_text(text)
            print("PAGE", number, "IMAGE", output / f"{stem}.png")
            print("TEXT_PREVIEW", " ".join(text.split())[:1800])


if __name__ == "__main__":
    main()

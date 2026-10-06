"""Inspect uploaded regulatory PDFs without importing or publishing their contents."""

import glob
import hashlib
import json
from pathlib import Path
import zipfile

import pymupdf as fitz


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    pack = glob.glob(
        "attached_assets/SBU_Accelerator_Knowledge_Pack_Draf_179129*.zip"
    )[0]
    with zipfile.ZipFile(pack) as archive:
        manifest = {
            row["document_id"]: row
            for row in json.loads(archive.read("source_integrity_manifest.json"))
        }
    output = Path("/tmp/sbu-original-pdf-review")
    output.mkdir(exist_ok=True)
    sources = [
        ("SBU-SRC-001", "PP_Nomor_28_Tahun_2025_*179129*.pdf", [1, 383]),
        ("SBU-SRC-002", "permen-pu-6-2025_*179129*.pdf", [1, 12, 13, 16]),
        ("SBU-SRC-003", "KEP_DIRJEN_BK_281_STANDAR_SKEMA_*179129*.pdf", [1, 3, 5, 15, 16]),
    ]
    for document_id, pattern, selected in sources:
        path = glob.glob("attached_assets/" + pattern)[0]
        digest = sha256_file(path)
        with fitz.open(path) as document:
            print(
                document_id,
                "pages=", len(document),
                "sha256=", digest,
                "manifest_match=", digest == manifest[document_id]["sha256"],
            )
            for number in selected:
                page = document[number - 1]
                target = output / f"{document_id}-p{number}.png"
                page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(target))
                print("RENDER", target)
                print("PAGE", number, page.get_text()[:700])
            if document_id == "SBU-SRC-002":
                for number, page in enumerate(document, 1):
                    text = page.get_text()
                    if "Pasal 20" in text or "Pasal 21" in text:
                        print("TRANSITION_PAGE", number, text[:9500])
            if document_id == "SBU-SRC-003":
                for number, page in enumerate(document, 1):
                    text = page.get_text()
                    if "2.1.3" in text or "2.1.5" in text:
                        print("QUALIFICATION_PAGE", number, text[:1800])


if __name__ == "__main__":
    main()

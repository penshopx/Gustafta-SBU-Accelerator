"""Inspect uploaded PDF identity and cover visuals without admitting retrieval."""
import glob
import hashlib
import json
from pathlib import Path
import fitz

output = Path("/tmp/sbu-knowledge-intake")
output.mkdir(exist_ok=True)
rows = []
covers = fitz.open()
for name in sorted(glob.glob("attached_assets/*179300*.pdf")):
    path = Path(name)
    document = fitz.open(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    texts = [page.get_text() for page in document]
    rows.append({
        "path": name, "bytes": path.stat().st_size, "sha256": digest,
        "pages": len(document),
        "low_text_pages": [i + 1 for i, text in enumerate(texts) if len(text.strip()) < 80],
        "sample": "\n".join(texts[:2])[:1400],
    })
    page = covers.new_page(width=420, height=590)
    page.insert_textbox(fitz.Rect(10, 5, 410, 45), path.name, fontsize=8)
    page.show_pdf_page(fitz.Rect(10, 48, 410, 580), document, 0)
    document.close()

# A compact contact sheet is enough for cover identity, not for validating tables.
sheet = fitz.open()
for start in range(0, len(covers), 4):
    page = sheet.new_page(width=840, height=1180)
    for index in range(start, min(start + 4, len(covers))):
        cell = index - start
        x, y = (cell % 2) * 420, (cell // 2) * 590
        page.show_pdf_page(fitz.Rect(x, y, x + 420, y + 590), covers, index)
    page.get_pixmap(matrix=fitz.Matrix(1.1, 1.1)).save(output / f"covers-{start // 4 + 1}.png")
(output / "inventory.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
print(json.dumps(rows, ensure_ascii=False, indent=2))

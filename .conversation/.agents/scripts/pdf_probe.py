import sys
from pathlib import Path

import fitz


path = Path(sys.argv[1])
page_numbers = [int(n) for n in sys.argv[2:]] or [1]
out_dir = Path(".agents/outputs/pdf-probe")
out_dir.mkdir(parents=True, exist_ok=True)
doc = fitz.open(path)
print(f"{path.name}: {doc.page_count} pages")
for number in page_numbers:
    page = doc[number - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(1.3, 1.3))
    output = out_dir / f"{path.stem}-p{number}.png"
    pix.save(output)
    print(f"Page {number}: {output}")
    print(page.get_text()[:1800])
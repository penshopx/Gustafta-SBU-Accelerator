import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) =>
  entity.startsWith("#x") ? String.fromCodePoint(parseInt(entity.slice(2), 16)) :
    entity.startsWith("#") ? String.fromCodePoint(Number(entity.slice(1))) :
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]);

// Poppler's word boxes measure the actual PDF, not the source DOM. This also
// detects text painted underneath a repeated notice even if extraction succeeds.
export function pdfPages(xml) {
  return [...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map((match) => ({
    width: Number(match[1]), height: Number(match[2]),
    words: [...match[3].matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g)]
      .map((word) => ({
        x1: Number(word[1]), y1: Number(word[2]), x2: Number(word[3]), y2: Number(word[4]),
        text: decode(word[5]),
      })),
  }));
}

export function assertSafePages(pages, disclaimer) {
  assert.ok(pages.length > 0, "PDF contains no pages");
  const expected = disclaimer.split(/\s+/);
  for (const [index, page] of pages.entries()) {
    const label = `page ${index + 1}`;
    const noticeWords = new Set();
    const notices = [];
    // bbox (not bbox-layout) preserves each text stream, including a fixed
    // header/footer stream that overlaps body text.
    for (let start = 0; start <= page.words.length - expected.length; start++) {
      const candidate = page.words.slice(start, start + expected.length);
      if (!candidate.every((word, offset) => word.text === expected[offset])) continue;
      candidate.forEach((word) => noticeWords.add(word));
      notices.push({
        x1: Math.min(...candidate.map((word) => word.x1)),
        y1: Math.min(...candidate.map((word) => word.y1)),
        x2: Math.max(...candidate.map((word) => word.x2)),
        y2: Math.max(...candidate.map((word) => word.y2)),
      });
    }
    assert.ok(notices.length > 0, `${label}: missing complete declaration/LSBU warning`);
    const content = page.words.filter((word) => !noticeWords.has(word));
    assert.ok(content.length >= 8, `${label}: blank or warning-only page`);
    for (const word of page.words) {
      assert.ok(word.x1 >= 0 && word.y1 >= 0 && word.x2 <= page.width && word.y2 <= page.height,
        `${label}: clipped text: ${word.text}`);
    }
    for (const notice of notices) {
      for (const word of content) {
        const overlaps = word.x1 < notice.x2 - 0.5 && word.x2 > notice.x1 + 0.5 &&
          word.y1 < notice.y2 - 0.5 && word.y2 > notice.y1 + 0.5;
        assert.ok(!overlaps, `${label}: content overlaps declaration warning: ${word.text}`);
      }
    }
  }
}

export async function renderPdf(html, directory, name) {
  const input = join(directory, `${name}.html`);
  const output = join(directory, `${name}.pdf`);
  await writeFile(input, html);
  // Fresh browser profile, local file, no live server, no auth or user data.
  // CSP in the real summary blocks requests; DNS is disabled as a second guard.
  await exec(process.env.CHROMIUM_BIN || "chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--no-first-run",
    "--no-default-browser-check", "--host-resolver-rules=MAP * ~NOTFOUND",
    `--user-data-dir=${join(directory, `browser-${name}`)}`,
    "--no-pdf-header-footer", `--print-to-pdf=${output}`, pathToFileURL(input).href,
  ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const { stdout } = await exec("pdftotext", ["-bbox", output, "-"], {
    timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
  });
  const pages = pdfPages(stdout);
  assert.ok(pages.length, "Poppler did not extract PDF pages");
  return pages;
}

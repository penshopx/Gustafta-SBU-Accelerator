import { createHash } from "node:crypto";
import type { DocumentRow } from "@workspace/db";

// Server-only fingerprinting. Keep this separate from the pure template and
// HTML renderer, which are also bundled by the native-print browser fixture.
export function smapDocuments(docs: DocumentRow[]) {
  return docs.filter(d => d.status === "ready" && d.scanStatus === "clean" &&
    !docs.some(newer => d.seriesId && newer.seriesId === d.seriesId && newer.version > d.version))
    .map(d => ({
      id: d.id, name: d.name, version: d.version,
      fingerprint: createHash("sha256").update(JSON.stringify([
        d.id, d.version, d.name, d.description, d.category, d.scanGeneration, d.seriesId,
      ])).digest("hex"),
    }));
}

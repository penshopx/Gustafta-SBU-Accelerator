import type { DocumentRow } from "@workspace/db";

export function publicDocument(row: DocumentRow) {
  const { objectPath: _objectPath, scanGeneration: _scanGeneration, ...safe } = row;
  return {
    ...safe, category: row.category ?? "lainnya", description: row.description ?? "",
    seriesId: row.seriesId ?? row.id, version: row.version ?? 1,
  };
}

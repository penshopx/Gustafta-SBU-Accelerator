import { mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

// The caller supplies the runner's already-sanitized report, never raw errors.
export async function publishReport(directory, report) {
  const json = JSON.stringify(report, null, 2) + '\n';
  await mkdir(directory, { recursive: true });
  // Independent of Clerk IDs, account suffixes, cookies and process identity.
  const runDirectory = await mkdtemp(join(directory, 'run-'));
  const relativeReport = `${basename(runDirectory)}/report.json`;
  const temporaryReport = join(runDirectory, '.report.tmp');
  const temporaryPointer = join(runDirectory, '.latest.tmp');
  try {
    await writeFile(temporaryReport, json, { flag: 'wx', mode: 0o600 });
    await rename(temporaryReport, join(runDirectory, 'report.json'));
    await writeFile(temporaryPointer, JSON.stringify({ report: relativeReport }) + '\n', {
      flag: 'wx', mode: 0o600,
    });
    // Same filesystem: readers see the entire previous or new pointer, never
    // a truncated JSON document. The referenced report is already complete.
    // Concurrent publishers may finish in either order; neither report is lost.
    await rename(temporaryPointer, join(directory, 'latest.json'));
    return relativeReport;
  } finally {
    // Keep a completed report even if publishing the latest pointer fails.
    await Promise.all([temporaryReport, temporaryPointer].map((path) => rm(path, { force: true })));
  }
}

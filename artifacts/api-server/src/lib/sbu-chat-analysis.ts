import type { SbuChatAnalysisContext } from "@workspace/api-zod";
import { consultationAnalysis } from "./consultation-analysis";

export type ReadChatAnalysis = typeof consultationAnalysis;
export const readChatAnalysis: ReadChatAnalysis = consultationAnalysis;
export class ChatAnalysisError extends Error {
  constructor(public status: 404 | 409 | 503) { super("chat_analysis_unavailable"); }
}

// Read only metadata and the selected stored result, never storage bytes or profiles.
// Each invocation rechecks owner, case, clean/ready state, version and revision.
export async function prepareChatAnalysis(
  input: SbuChatAnalysisContext, userId: string, read: ReadChatAnalysis = readChatAnalysis,
) {
  let preview;
  try {
    preview = await read(input.caseId, input.selection.documentId, input.selection.analysisId, userId);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    throw new ChatAnalysisError(status === 404 || status === 409 ? status : 503);
  }
  const { selection } = input;
  // Check the returned binding as well as the reader's owner-scoped query.
  if (preview.caseId !== input.caseId || preview.documentId !== selection.documentId ||
      preview.analysisId !== selection.analysisId || preview.revision !== selection.revision ||
      !selection.excerpt.trim() || !preview.text.includes(selection.excerpt)) {
    throw new ChatAnalysisError(409);
  }
  const { text: _fullResult, ...reference } = preview;
  const context = JSON.stringify({
    analysisSnapshot: { ...reference, excerpt: selection.excerpt },
  });
  if (context.length > 8000) throw new ChatAnalysisError(409);
  return context;
}

export const CHAT_ANALYSIS_ERROR = "Sumber Bedah Dokumen hilang, berubah, atau belum dapat diperiksa. Mulai percakapan baru, tinjau ulang cuplikan dan berikan persetujuan baru. Draf pesan tidak dihapus.";

// Legacy route tests isolate their original tables. Exercise the new context
// against real isolated Postgres separately in workspace-foundation.test.mjs.
import { getAuth } from "@clerk/express";
export async function getContext(req) {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Unauthenticated test context");
  return { userId, orgId: 1, role: "kontraktor", clientIds: [1], defaultClientId: 1, clients: [] };
}
export async function recordCaseAudit() {}
export async function workspaceDisclaimer() { return "Test disclaimer"; }

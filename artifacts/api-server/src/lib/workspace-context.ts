import { getAuth } from "@clerk/express";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { appSettingsTable, auditLogsTable, clientsTable, db, profilesTable, workspacesTable } from "@workspace/db";

export const DEFAULT_DISCLAIMER = "SBU Accelerator adalah alat bantu persiapan mandiri dan tidak berafiliasi dengan Kementerian PU, LPJK, maupun LSBU. Aplikasi ini tidak menerbitkan atau menjamin SBU.";

export type WorkspaceContext = {
  userId: string;
  orgId: number;
  role: string;
  clientIds: number[];
  defaultClientId: number;
  clients: { id: number; name: string; businessType: string | null; isDefault: boolean }[];
};
const contexts = new WeakMap<Request, Promise<WorkspaceContext>>();

export function getContext(req: Request): Promise<WorkspaceContext> {
  const cached = contexts.get(req);
  if (cached) return cached;
  // No request body, header or self-selected role can choose another workspace.
  const userId = getAuth(req).userId;
  if (!userId) return Promise.reject(new Error("Authenticated session required"));
  const pending = db.transaction(async (tx) => {
    await tx.insert(profilesTable).values({ userId }).onConflictDoNothing();
    const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    await tx.insert(workspacesTable).values({ ownerId: userId }).onConflictDoNothing();
    const [workspace] = await tx.select().from(workspacesTable).where(eq(workspacesTable.ownerId, userId));
    await tx.insert(clientsTable).values({
      orgId: workspace.id, name: "Wadah kasus pribadi", isDefault: true,
    }).onConflictDoNothing();
    const clients = await tx.select().from(clientsTable).where(eq(clientsTable.orgId, workspace.id));
    const defaultClient = clients.find((client) => client.isDefault);
    if (!defaultClient) throw new Error("Default workspace client unavailable");
    return {
      userId, orgId: workspace.id, role: profile.role,
      clientIds: clients.map((client) => client.id),
      defaultClientId: defaultClient.id,
      clients: clients.map(({ id, name, businessType, isDefault }) => ({ id, name, businessType, isDefault })),
    };
  });
  contexts.set(req, pending);
  return pending;
}

export async function workspaceDisclaimer(): Promise<string> {
  const [setting] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "disclaimer"));
  // The minimum legal boundary is immutable. A setting cannot remove it.
  return setting?.value === DEFAULT_DISCLAIMER ? setting.value : DEFAULT_DISCLAIMER;
}

export async function recordCaseAudit(
  context: WorkspaceContext, action: string, entityId: number,
  changedFields: string[], transaction: Pick<typeof db, "insert">,
): Promise<void> {
  await transaction.insert(auditLogsTable).values({
    orgId: context.orgId, userId: context.userId, action,
    entity: "case", entityId: String(entityId),
    summary: { changedFields },
  });
}

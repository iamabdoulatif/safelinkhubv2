"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, vouchers, packages, floatTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export type AgentWithStats = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  salesCount: number;
  revenueCents: number;
  commissionCents: number;
};

/**
 * Agents have no separate table — they're just /admin/users rows with
 * role="agent". A sale is a voucher tagged with agentId, so each agent's
 * stats are derived by joining their vouchers to the package that was sold
 * (for price/commission) rather than duplicating that data anywhere.
 */
export async function listAgentsWithStats(): Promise<AgentWithStats[]> {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const agentRows = await db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.orgId, session.orgId), eq(users.role, "agent")))
    .orderBy(desc(users.createdAt));

  if (agentRows.length === 0) return [];

  const saleRows = await db
    .select({
      agentId: vouchers.agentId,
      priceCents: packages.priceCents,
      commissionCents: packages.commissionCents,
    })
    .from(vouchers)
    .innerJoin(packages, eq(vouchers.packageId, packages.id))
    .where(eq(vouchers.orgId, session.orgId));

  const statsByAgent = new Map<string, { salesCount: number; revenueCents: number; commissionCents: number }>();
  for (const row of saleRows) {
    if (!row.agentId) continue;
    const current = statsByAgent.get(row.agentId) ?? {
      salesCount: 0,
      revenueCents: 0,
      commissionCents: 0,
    };
    current.salesCount += 1;
    current.revenueCents += row.priceCents;
    current.commissionCents += row.commissionCents;
    statsByAgent.set(row.agentId, current);
  }

  return agentRows.map((agent) => ({
    ...agent,
    ...(statsByAgent.get(agent.id) ?? { salesCount: 0, revenueCents: 0, commissionCents: 0 }),
  }));
}

export async function createAgent(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "Le nom, l'email et le mot de passe sont requis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return { error: "Un compte avec cet email existe déjà." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    orgId: session.orgId,
    name,
    email,
    passwordHash,
    role: "agent",
  });

  revalidatePath("/admin/agent");
  return { success: true };
}

export async function deleteAgent(agentId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [agent] = await db
    .select({ orgId: users.orgId, role: users.role })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agent || agent.orgId !== session.orgId || agent.role !== "agent") {
    return { error: "Agent not found." };
  }

  await db.delete(users).where(eq(users.id, agentId));

  revalidatePath("/admin/agent");
  return { success: true };
}

/**
 * The actual POS action: an agent collects cash for a package on the spot,
 * so this both issues the voucher (tagged to the agent for commission
 * tracking) and books the cash received as a float deposit in one step —
 * mirroring what createFloatTransaction does for the manual float page.
 */
export async function sellPackageAsAgent(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const agentId = String(formData.get("agentId") ?? "");
  const packageId = String(formData.get("packageId") ?? "");

  if (!agentId || !packageId) {
    return { error: "Sélectionnez un agent et un forfait." };
  }

  const db = getDb();
  const [agent] = await db
    .select({ id: users.id, name: users.name, orgId: users.orgId, role: users.role })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agent || agent.orgId !== session.orgId || agent.role !== "agent") {
    return { error: "Agent not found." };
  }

  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, session.orgId)))
    .limit(1);
  if (!pkg) {
    return { error: "Forfait introuvable." };
  }
  if (!pkg.active) {
    return { error: "Ce forfait est désactivé." };
  }

  const username = randomCode();
  await db.insert(vouchers).values({
    orgId: session.orgId,
    username,
    packageId: pkg.id,
    agentId: agent.id,
    status: "PROVISIONED",
    useCase: "Agent / POS",
    note: `Vendu en espèces par ${agent.name}`,
  });

  await db.insert(floatTransactions).values({
    orgId: session.orgId,
    type: "deposit",
    amountCents: pkg.priceCents,
    note: `Vente "${pkg.name}" par l'agent ${agent.name} (voucher ${username})`,
    createdBy: session.userId,
  });

  revalidatePath("/admin/agent");
  revalidatePath("/admin/float");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/vouchers");
  return { success: true, voucherCode: username, packageName: pkg.name, priceCents: pkg.priceCents };
}

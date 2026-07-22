import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listVpnAccessInventory } from "@/lib/mikrotik/vpn-access-vault-actions";
import VpnAccessVault from "./VpnAccessVault";

export default async function VpnAccessPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");
  const inventory = await listVpnAccessInventory();
  return <VpnAccessVault inventory={inventory} />;
}

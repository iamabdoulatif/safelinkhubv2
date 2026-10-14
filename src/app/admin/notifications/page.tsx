import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { loadWhatsappBroadcast } from "@/lib/notifications/whatsapp-actions";
import { defaultBroadcastMessage } from "@/lib/notifications/whatsapp-broadcast";
import WhatsappBroadcast from "./WhatsappBroadcast";

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const data = await loadWhatsappBroadcast();
  if ("error" in data) redirect("/admin");

  // Modèle avec le jeton {org}, remplacé par le nom de chaque organisation.
  const defaultMessage = defaultBroadcastMessage("{org}");

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-ink text-2xl font-semibold tracking-tight">Notifications WhatsApp</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Prévenir les organisations (celles ayant un routeur MikHmon) d’une mise à jour SaaS.
        Le jeton <code className="font-mono">{"{org}"}</code> est remplacé par le nom de chaque organisation.
      </p>
      <WhatsappBroadcast
        recipients={data.recipients}
        apiConfigured={data.apiConfigured}
        defaultMessage={defaultMessage}
      />
    </div>
  );
}

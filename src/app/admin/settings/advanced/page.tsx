import { Settings } from "lucide-react";
import { getCurrentOrganization } from "@/lib/organizations/actions";
import RenameOrgForm from "./RenameOrgForm";
import DangerZone from "./DangerZone";
import AutopilotLinkCard from "./AutopilotLinkCard";
import { getSession } from "@/lib/auth/session";
import { linkStatus } from "@/lib/autopilot/link";

export default async function AdvancedSettingsPage() {
  const org = await getCurrentOrganization();
  const session = await getSession();
  const link = session?.orgId ? await linkStatus(session.orgId).catch(() => null) : null;
  const linkView = link
    ? { linkedAt: link.linkedAt?.toISOString() ?? null, lastUsedAt: link.lastUsedAt?.toISOString() ?? null }
    : null;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-ink" />
        <h1 className="text-ink text-2xl font-semibold tracking-tight">Avancé</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Paramètres avancés de l&apos;organisation.
      </p>

      <div className="mt-6 space-y-6">
        {org && <RenameOrgForm currentName={org.name} />}
        {org && <AutopilotLinkCard status={linkView} />}
        {org && <DangerZone slug={org.slug} />}
      </div>
    </div>
  );
}

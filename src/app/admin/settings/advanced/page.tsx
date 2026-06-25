import { Settings } from "lucide-react";
import { getCurrentOrganization } from "@/lib/organizations/actions";
import RenameOrgForm from "./RenameOrgForm";
import DangerZone from "./DangerZone";

export default async function AdvancedSettingsPage() {
  const org = await getCurrentOrganization();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Avancé</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Paramètres avancés de l&apos;organisation.
      </p>

      <div className="mt-6 space-y-6">
        {org && <RenameOrgForm currentName={org.name} />}
        {org && <DangerZone slug={org.slug} />}
      </div>
    </div>
  );
}

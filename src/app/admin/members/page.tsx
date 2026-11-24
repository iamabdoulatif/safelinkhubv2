import { UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listMembers, listPendingInvitations } from "@/lib/org/members";
import { listSites } from "@/lib/org/sites";
import { listMemberSiteIds } from "@/lib/org/member-sites";
import MembersManager from "./MembersManager";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await getSession();
  /* La capacité, pas le rôle : c'est la même règle que celle qu'appliquent les
     actions serveur, donc l'écran ne peut pas montrer ce qu'elles refuseront. */
  if (!session || !can(session.role, "members")) {
    return (
      <p className="text-sm text-ink-soft">
        Seuls les administrateurs du compte peuvent gérer les membres.
      </p>
    );
  }

  const [membres, invitations, allSites, memberSiteIds] = await Promise.all([
    listMembers(session.orgId),
    listPendingInvitations(session.orgId),
    listSites(session.orgId),
    listMemberSiteIds(session.orgId),
  ]);
  // Map → objet simple (Map ne traverse pas la frontière serveur→client).
  const sitesByMember: Record<string, string[]> = Object.fromEntries(memberSiteIds);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-2 text-ink text-2xl font-semibold tracking-tight">
        <UsersRound className="h-5 w-5" />
        Membres du compte
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Invitez vos collaborateurs et choisissez ce que chacun peut faire.
      </p>
      <MembersManager
        membres={membres}
        invitations={invitations}
        moiId={session.userId}
        sites={allSites.map((s) => ({ id: s.id, name: s.name }))}
        sitesByMember={sitesByMember}
      />
    </div>
  );
}

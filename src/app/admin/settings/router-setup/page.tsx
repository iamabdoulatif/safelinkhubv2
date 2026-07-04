import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, bridges } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import MethodTabs from "./MethodTabs";
import StepIndicator from "./StepIndicator";
import RouterSetupWizard from "./RouterSetupWizard";
import RouterResetButton from "./RouterResetButton";

// provisionHotspotStack (the "Lancer l'auto-setup complet" Server Action
// on this page) runs dozens of sequential RouterOS API round-trips plus
// a container-image pull/start wait loop that alone can take up to 3
// minutes — comfortably past the platform's default Server Action
// timeout. Without raising it here (Server Actions inherit their
// timeout from the page they're invoked on, not their own file), Vercel
// kills the function mid-run once the MikHmon container step actually
// has to wait on a real Docker Hub pull, and the wizard's "Configuration
// en cours..." button just hangs forever waiting on a response that
// will never arrive.
export const maxDuration = 300;

export default async function RouterSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; router?: string }>;
}) {
  const session = await getSession();
  const db = getDb();
  const params = await searchParams;

  const orgRouters = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
    : [];

  // "?new=1" (bouton « Lier un MikroTik ») force l'Étape 1 de connexion
  // même quand un routeur déjà configuré est en ligne — sans ce mode, la
  // page rouvrait toujours le wizard du dernier routeur et il était
  // impossible d'en lier un deuxième. "?router=<id>" ouvre le wizard d'un
  // routeur précis. Par défaut : le plus récent (comportement historique).
  const forceNew = params.new === "1";
  const router = params.router
    ? orgRouters.find((r) => r.id === params.router) ?? orgRouters[0]
    : orgRouters[0];

  // Dans le mode « nouveau », la bannière d'état ne doit référencer qu'une
  // liaison encore en cours (routeur pas encore en ligne) — jamais le
  // routeur déjà configuré.
  const pendingRouter = orgRouters.find((r) => r.status !== "online");
  const onlineRouter = orgRouters.find((r) => r.status === "online");

  const isOnline = !forceNew && Boolean(router && router.status === "online");
  const bannerRouter = forceNew ? pendingRouter : router;

  const routerBridges = isOnline
    ? await db.select().from(bridges).where(eq(bridges.routerId, router!.id))
    : [];

  return (
    <div className={`mx-auto ${isOnline ? "max-w-6xl" : "max-w-3xl"}`}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">
          Configuration automatique du routeur
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-soft">
          Configurez votre appareil MikroTik RouterOS avec SafeLinkHub en trois
          étapes : connexion de l&apos;appareil, topologie réseau, puis
          configuration automatique complète.
        </p>
      </div>

      {!isOnline ? (
        <>
          <StepIndicator steps={[1, 2, 3]} currentStep={1} />

          {forceNew && onlineRouter && (
            <div className="mt-4 rounded-md border border-line-soft bg-clay px-4 py-2.5 text-sm text-ink-soft">
              Vous liez un nouvel appareil. &quot;{onlineRouter.name}&quot; reste
              configuré —{" "}
              <a
                href={`/admin/settings/router-setup?router=${onlineRouter.id}`}
                className="font-medium text-ink underline"
              >
                reprendre sa configuration
              </a>
              .
            </div>
          )}

          {bannerRouter && (
            <div className="mt-4 flex items-center justify-between rounded-md border border-line-soft bg-clay px-4 py-2.5">
              <span className="text-sm text-ink-soft">
                Configuration en cours pour &quot;{bannerRouter.name}&quot;
                {bannerRouter.status === "pending" || bannerRouter.status === "installing"
                  ? " (en attente de connexion)"
                  : ""}
                .
              </span>
              <RouterResetButton
                routerId={bannerRouter.id}
                label="Réinitialiser le processus"
                confirmLabel="Annuler cette configuration et repartir de zéro"
              />
            </div>
          )}
          <MethodTabs />
        </>
      ) : (
        <>
          <div className="mt-2 text-center">
            <a
              href="/admin/settings/router-setup?new=1"
              className="text-sm text-ink-soft underline hover:text-ink"
            >
              Lier un autre MikroTik
            </a>
          </div>
          <RouterSetupWizard
            routerId={router!.id}
            routerName={router!.name}
            initialBridges={routerBridges.map((b) => ({
              id: b.id,
              name: b.name,
              gatewayIp: b.gatewayIp,
              subnetBits: b.subnetBits,
              ports: b.ports,
              hotspotEnabled: b.hotspotEnabled,
            }))}
            savedHotspotNames={{
              serverName: router!.hotspotServerName,
            }}
          />
        </>
      )}
    </div>
  );
}

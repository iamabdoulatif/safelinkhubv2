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

export default async function RouterSetupPage() {
  const session = await getSession();
  const db = getDb();

  const [router] = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
        .limit(1)
    : [];

  const isOnline = Boolean(router && router.status === "online");

  const routerBridges = isOnline
    ? await db.select().from(bridges).where(eq(bridges.routerId, router!.id))
    : [];

  return (
    <div className={`mx-auto ${isOnline ? "max-w-6xl" : "max-w-3xl"}`}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Configuration automatique du routeur
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
          Configurez votre appareil MikroTik RouterOS avec SafeLinkHub.
          D&apos;abord, installez le tunnel d&apos;accès distant sécurisé, concevez
          ensuite votre topologie réseau, puis vérifiez la connexion finale.
        </p>
      </div>

      {!isOnline ? (
        <>
          <StepIndicator steps={[1, 2, 3, 4, 5, 6, 7, 8, 9]} currentStep={1} />

          {router && (
            <div className="mt-4 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-sm text-slate-500">
                Configuration en cours pour &quot;{router.name}&quot;
                {router.status === "pending" || router.status === "installing"
                  ? " (en attente de connexion)"
                  : ""}
                .
              </span>
              <RouterResetButton
                routerId={router.id}
                label="Réinitialiser le processus"
                confirmLabel="Annuler cette configuration et repartir de zéro"
              />
            </div>
          )}
          <MethodTabs />
        </>
      ) : (
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
            bridgeName: router!.hotspotBridgeName,
            serverName: router!.hotspotServerName,
          }}
        />
      )}
    </div>
  );
}

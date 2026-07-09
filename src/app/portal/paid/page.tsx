// Page de retour après le checkout GeniusPay (success_url / error_url de
// /api/portal/[slug]/initiate). Ouverte dans l'onglet du checkout : purement
// informative. C'est l'onglet du portail (login.html) resté ouvert qui sonde le
// statut et connecte le client une fois le paiement confirmé.

export default async function PortalPaidPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const isError = status === "error";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 8 }}>{isError ? "⚠️" : "✅"}</div>
        <h1 style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>
          {isError ? "Paiement non abouti" : "Paiement reçu"}
        </h1>
        <p style={{ color: "#64748b", fontSize: ".95rem", margin: 0 }}>
          {isError
            ? "Le paiement n'a pas pu être finalisé. Revenez à l'onglet WiFi pour réessayer."
            : "Retournez à l'onglet WiFi : votre connexion s'ouvre automatiquement. Votre code d'accès vous est aussi envoyé par SMS."}
        </p>
      </div>
    </main>
  );
}

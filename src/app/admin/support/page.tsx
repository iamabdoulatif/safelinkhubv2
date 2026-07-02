import { LifeBuoy } from "lucide-react";
import { listSupportTickets } from "@/lib/support/actions";
import NewTicketForm from "./NewTicketForm";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function SupportPage() {
  const tickets = await listSupportTickets();

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Support</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Envoyez une demande à l&apos;équipe SafeLinkHub et suivez son statut.
      </p>

      <div className="mt-6">
        <NewTicketForm />
      </div>

      <div className="mt-6 overflow-hidden border-2 border-line bg-paper">
        <div className="border-b border-line-soft bg-clay px-4 py-3">
          <h2 className="text-sm font-medium text-ink-soft">Vos demandes</h2>
        </div>
        <div className="divide-y divide-line-soft">
          {tickets.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">
              Aucune demande envoyée pour le moment.
            </p>
          )}
          {tickets.map((t) => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-ink">{t.subject}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    t.status === "resolved"
                      ? "bg-clay text-ok"
                      : "bg-clay text-warn"
                  }`}
                >
                  {t.status === "resolved" ? "Résolu" : "Ouvert"}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{t.message}</p>
              <p className="mt-1.5 text-xs text-ink-soft">{formatDate(t.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

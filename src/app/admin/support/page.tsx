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
        <LifeBuoy className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Envoyez une demande à l&apos;équipe SafeLinkHub et suivez son statut.
      </p>

      <div className="mt-6">
        <NewTicketForm />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-600">Vos demandes</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {tickets.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Aucune demande envoyée pour le moment.
            </p>
          )}
          {tickets.map((t) => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{t.subject}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    t.status === "resolved"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {t.status === "resolved" ? "Résolu" : "Ouvert"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{t.message}</p>
              <p className="mt-1.5 text-xs text-slate-400">{formatDate(t.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { contactMessages } from "@/lib/db/schema";
import { updateContactMessageStatus } from "@/lib/contact/actions";
import DeleteContactMessageButton from "./DeleteContactMessageButton";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: "Nouveau", className: "bg-brand text-[#1C1917]" },
  read: { label: "Lu", className: "bg-clay text-ink-soft" },
  archived: { label: "Archivé", className: "bg-clay text-ink-soft line-through" },
};

export default async function AdminContactPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const db = getDb();
  const messages = await db
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.createdAt));

  const newCount = messages.filter((m) => m.status === "new").length;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-ink">Messages de contact</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Messages envoyés depuis le formulaire public /contact
        {newCount > 0 && ` — ${newCount} nouveau${newCount > 1 ? "x" : ""}`}.
      </p>

      {messages.length === 0 ? (
        <div className="mt-6 border-2 border-line bg-paper p-8 text-center">
          <p className="font-semibold text-ink">Aucun message.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Les messages du formulaire de contact apparaîtront ici.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3" role="list">
          {messages.map((msg) => {
            const status = STATUS_LABELS[msg.status] ?? STATUS_LABELS.new;
            return (
              <li key={msg.id} className="border-2 border-line bg-paper p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {msg.name}{" "}
                      <a
                        href={`mailto:${msg.email}`}
                        className="font-normal text-brand-deep hover:underline"
                      >
                        &lt;{msg.email}&gt;
                      </a>
                    </p>
                    {msg.subject && (
                      <p className="mt-0.5 text-sm font-semibold text-ink">{msg.subject}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                    <span className="font-mono text-xs text-ink-soft">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {msg.message}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                  {msg.status !== "read" && (
                    <form action={updateContactMessageStatus}>
                      <input type="hidden" name="id" value={msg.id} />
                      <input type="hidden" name="status" value="read" />
                      <button
                        type="submit"
                        className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                      >
                        Marquer comme lu
                      </button>
                    </form>
                  )}
                  {msg.status !== "archived" && (
                    <form action={updateContactMessageStatus}>
                      <input type="hidden" name="id" value={msg.id} />
                      <input type="hidden" name="status" value="archived" />
                      <button
                        type="submit"
                        className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                      >
                        Archiver
                      </button>
                    </form>
                  )}
                  {msg.status === "archived" && (
                    <form action={updateContactMessageStatus}>
                      <input type="hidden" name="id" value={msg.id} />
                      <input type="hidden" name="status" value="new" />
                      <button
                        type="submit"
                        className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                      >
                        Restaurer
                      </button>
                    </form>
                  )}
                  <DeleteContactMessageButton id={msg.id} name={msg.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

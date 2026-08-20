import { retryBlogPostShare } from "@/lib/blog/actions";
import { CHANNEL_LABEL, type ShareChannel } from "@/lib/social/channels";
import { type ShareRow } from "@/lib/social/share";

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

/**
 * État de la diffusion d'un article, canal par canal.
 *
 * Sans cet écran, un jeton expiré fait échouer les envois en silence : la
 * publication réussit, personne ne voit que rien n'est parti. L'erreur brute
 * du réseau est affichée telle quelle — « Session has expired » est plus utile
 * qu'« échec ».
 */
export default function ShareStatusPanel({
  postId,
  shares,
  channels,
}: {
  postId: string;
  shares: ShareRow[];
  channels: ShareChannel[];
}) {
  if (channels.length === 0) return null;

  return (
    <section className="mt-6 max-w-3xl rounded-xl border border-line bg-paper p-6">
      <h2 className="text-sm font-semibold text-ink">Diffusion sur les réseaux</h2>
      <ul className="mt-4 divide-y divide-line" role="list">
        {channels.map((channel) => {
          const row = shares.find((s) => s.channel === channel);
          return (
            <li key={channel} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-24 text-sm font-medium text-ink">
                {CHANNEL_LABEL[channel]}
              </span>

              {!row && <span className="text-sm text-ink-soft">Pas encore diffusé</span>}

              {row?.status === "sent" && (
                <span className="inline-flex items-center gap-2 rounded-full bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">
                  Diffusé le {dateFr.format(row.createdAt)}
                </span>
              )}

              {row?.status === "failed" && (
                <span className="inline-flex items-center gap-2 rounded-full bg-err-soft px-3 py-1 text-xs font-semibold text-err">
                  Échec
                </span>
              )}

              {row?.externalUrl && (
                <a
                  href={row.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-brand-deep underline underline-offset-2"
                >
                  Voir le message
                </a>
              )}

              <form action={retryBlogPostShare} className="ml-auto">
                <input type="hidden" name="id" value={postId} />
                <input type="hidden" name="channel" value={channel} />
                <button
                  type="submit"
                  className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink hover:bg-clay"
                >
                  {row?.status === "sent" ? "Rediffuser" : "Relancer"}
                </button>
              </form>

              {row?.error && (
                <p className="w-full break-words font-mono text-xs text-err">{row.error}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

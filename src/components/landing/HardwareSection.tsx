import Image from "next/image";
import GeoIcon from "./GeoIcon";
import { hardware, vendors } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* Section intégrations, motif Slate : grande carte claire avec la liste des
 * constructeurs, puis les fiches matériel détaillées en dessous. */
export default function HardwareSection({ dict }: { dict: Dictionary }) {
  return (
    <section
      id="materiel"
      aria-label={dict.hardware.aria}
      className="border-b border-line bg-paper py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal slate-card overflow-hidden bg-clay">
          {/* Photo décorative (Pexels, auto-hébergée) : alt vide, elle
              n'apporte rien qu'un lecteur d'écran doive entendre. */}
          <Image
            src="/landing/photos/baie-reseau.jpg"
            alt=""
            width={1400}
            height={933}
            sizes="100vw"
            className="h-40 w-full object-cover sm:h-52"
          />
          <div className="grid grid-cols-1 items-center gap-8 p-8 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
                {dict.hardware.titleA}
                <span className="marker">{dict.hardware.titleMark}</span>
                {dict.hardware.titleB}
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                {dict.hardware.lead}
              </p>
            </div>
            <ul role="list" className="flex flex-wrap gap-2.5 lg:col-span-7 lg:justify-end">
              {vendors.map((v) => (
                <li
                  key={v}
                  translate="no"
                  className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink"
                >
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stagger mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          {hardware.map((h, i) => {
            const t = dict.content.hardware[i];
            return (
            <article key={t.name} className="reveal slate-card flex gap-5 bg-paper p-6 sm:p-7">
              <div aria-hidden="true" className="shrink-0 text-ink">
                <GeoIcon name={h.icon} className="h-10 w-10" accent="#3F6212" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-ink" translate="no">
                  {t.name}
                  {i === 0 && (
                    <span className="ml-3 align-middle rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-deep">
                      {dict.hardware.native}
                    </span>
                  )}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{t.description}</p>
              </div>
            </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

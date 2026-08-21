import Image from "next/image";
import { vendors } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* Bandeau « Compatible avec » — logos qui défilent de la gauche vers la droite,
 * en boucle sans couture.
 *
 * ALIGNEMENT : les huit logos ont des proportions incomparables (Cambium fait
 * 3840×2987, Ruijie 500×206) et certains portent une marge blanche interne.
 * Les poser côte à côte tels quels donnerait une ligne bancale. Chacun occupe
 * donc un EMPLACEMENT de taille fixe et s'y centre — c'est l'emplacement qui
 * aligne, pas l'image.
 *
 * BOUCLE : la liste est rendue deux fois et la piste translate de -50 % à 0.
 * Arrivée au bout, la seconde copie occupe exactement la position de départ de
 * la première : le raccord est invisible. La copie est aria-hidden, sinon un
 * lecteur d'écran énoncerait seize constructeurs au lieu de huit.
 */

/* `cap` : hauteur maximale en pixels, réglée logo par logo.
 *
 * Une hauteur unique donnerait une ligne bancale : mesuré au canvas, Ruijie ne
 * remplit que 55 % de sa boîte en hauteur et sortirait deux fois plus petit
 * qu'un logo cadré au plus juste. Chaque `cap` vise environ 24 px d'ENCRE
 * réelle, ce qui est le seul repère qui compte à l'œil.
 *
 * `opaque` : l'image n'a pas de couche alpha, son fond blanc est cuit dedans
 * (exports « kisspng »). En multiply, ce blanc se fond dans la bande claire au
 * lieu d'y poser un rectangle. D-Link était le pire cas — 400×400 dont 21 % de
 * logo, fond blanc à damier ; il a été recadré à sa boîte d'encre (400×81). */
const LOGOS: Record<
  string,
  { file: string; width: number; height: number; cap: number; opaque?: boolean }
> = {
  "MikroTik":         { file: "mikrotik.png", width: 432,  height: 462,  cap: 32 },
  "Ruijie Reyee":     { file: "ruijie.png",   width: 500,  height: 206,  cap: 34 },
  "TP-Link":          { file: "tp-link.webp", width: 960,  height: 366,  cap: 26 },
  "Ubiquiti UniFi":   { file: "ubiquiti.png", width: 705,  height: 533,  cap: 34 },
  "Cambium Networks": { file: "cambium.webp", width: 3840, height: 2987, cap: 34 },
  "Cisco":            { file: "cisco.webp",   width: 1280, height: 676,  cap: 28 },
  "D-Link":           { file: "d-link.png",   width: 400,  height: 81,   cap: 18, opaque: true },
  "Huawei":           { file: "huawei.webp",  width: 400,  height: 400,  cap: 34, opaque: true },
};

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul
      role={hidden ? "presentation" : "list"}
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center"
    >
      {vendors.map((name) => {
        const logo = LOGOS[name];
        return (
          <li key={name} className="flex h-14 w-40 shrink-0 items-center justify-center px-4">
            {logo ? (
              <Image
                src={`/partenariat/${logo.file}`}
                alt={hidden ? "" : name}
                width={logo.width}
                height={logo.height}
                sizes="160px"
                /* Deux bornes, pas une : la hauteur seule laissait D-Link et
                   Ruijie s'étaler sur 107 px pendant que MikroTik en occupait
                   26. Ce que l'œil compare dans une rangée de logos, c'est
                   l'encombrement, pas la hauteur de casse. */
                style={{
                  maxHeight: logo.cap,
                  maxWidth: 92,
                  mixBlendMode: logo.opaque ? "multiply" : undefined,
                }}
                className="w-auto object-contain opacity-75 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
              />
            ) : (
              // Un constructeur ajouté à `vendors` sans logo reste annoncé, en
              // texte, plutôt que de disparaître du bandeau.
              <span className="text-sm font-medium text-ink-soft">{name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function VendorMarquee({ dict }: { dict: Dictionary }) {
  return (
    <div className="border-t border-line bg-clay py-5">
      <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {dict.hero.compatible}
      </p>
      <div className="marquee">
        <div className="marquee-track">
          <Row />
          <Row hidden />
        </div>
      </div>
    </div>
  );
}

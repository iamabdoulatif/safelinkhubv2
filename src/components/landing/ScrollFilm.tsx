"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Film du hero piloté par le scroll.
 *
 * DESKTOP : la section est « épinglée » sur plusieurs hauteurs d'écran ; chaque
 * position de scroll correspond à UNE image d'une séquence (WebP) dessinée sur
 * un canvas. C'est la seule technique qui reste image par image sur tous les
 * navigateurs : piloter `video.currentTime` au scroll saccade sur Safari/iOS.
 *
 * MOBILE, MOUVEMENT RÉDUIT, ÉCONOMIE DE DONNÉES : pas d'épinglage ni de
 * séquence (trop lourde) — la vidéo maître joue seule, ou l'affiche fixe si le
 * mouvement doit être réduit. Le texte reste le même dans tous les cas.
 */
export type FilmStage = { title: string; text: string };

type Mode = "poster" | "video" | "scrub";

export default function ScrollFilm({
  frameCount,
  framePath,
  poster,
  videoMp4,
  videoWebm,
  stages,
  scrollLabel,
  children,
}: {
  frameCount: number;
  /** Chemin des images, `{i}` remplacé par le numéro sur 3 chiffres (001…). */
  framePath: string;
  poster: string;
  videoMp4: string;
  videoWebm: string;
  /** Phrases affichées après le bloc d'ouverture, au fil du film. */
  stages: FilmStage[];
  scrollLabel: string;
  /** Bloc d'ouverture : titre, texte, CTA (rendu côté serveur). */
  children: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("poster");
  const [stage, setStage] = useState(-1); // -1 = bloc d'ouverture
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Choix du mode, APRÈS le montage : le serveur rend toujours l'affiche.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dépend de l'appareil, inconnu au rendu serveur
    setMode(reduced ? "poster" : wide && !saveData ? "scrub" : "video");
  }, []);

  useEffect(() => {
    if (mode !== "scrub") return;
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !section || !ctx) return;

    const src = (i: number) => framePath.replace("{i}", String(i + 1).padStart(3, "0"));
    const frames: (HTMLImageElement | null)[] = Array(frameCount).fill(null);
    let wanted = 0;
    let drawn = -1;
    let raf = 0;
    let cancelled = false;

    // Chargement progressif : une image sur 8 d'abord (le film est « lisible »
    // tout de suite en saccadé), puis on comble les trous.
    const order: number[] = [];
    for (const step of [8, 4, 2, 1]) {
      for (let i = 0; i < frameCount; i += step) if (!order.includes(i)) order.push(i);
    }
    let cursor = 0;
    const loadNext = () => {
      if (cancelled || cursor >= order.length) return;
      const i = order[cursor++];
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        frames[i] = img;
        if (drawn === -1 || Math.abs(i - wanted) < Math.abs(drawn - wanted)) schedule();
        loadNext();
      };
      img.onerror = loadNext;
      img.src = src(i);
    };
    for (let k = 0; k < 4; k++) loadNext();

    const nearest = (i: number) => {
      for (let d = 0; d < frameCount; d++) {
        if (frames[i - d]) return i - d;
        if (frames[i + d]) return i + d;
      }
      return -1;
    };

    const draw = () => {
      raf = 0;
      const i = nearest(wanted);
      if (i < 0 || i === drawn) return;
      const img = frames[i]!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // « cover » : l'image remplit l'écran sans déformation.
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      drawn = i;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const span = section.offsetHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      wanted = Math.round(progress * (frameCount - 1));
      // Bloc d'ouverture sur le premier quart, puis une phrase par tranche.
      const s = progress < 0.25 ? -1 : Math.min(stages.length - 1, Math.floor(((progress - 0.25) / 0.75) * stages.length));
      setStage(s);
      drawn = drawn === wanted ? drawn : -2; // force le redessin si besoin
      schedule();
    };
    const onResize = () => {
      drawn = -2;
      schedule();
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mode, frameCount, framePath, stages.length]);

  const scrub = mode === "scrub";
  return (
    <section
      ref={sectionRef}
      aria-label={stages[stages.length - 1]?.title}
      className={`relative bg-[#080A0E] text-white ${scrub ? "h-[420vh]" : ""}`}
    >
      <div className={`${scrub ? "sticky top-0" : "relative"} h-[100svh] min-h-[560px] overflow-hidden`}>
        {/* Média : affiche (serveur, mouvement réduit), vidéo (mobile) ou canvas (desktop). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- affiche plein écran, déjà optimisée */}
        <img src={poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        {mode === "video" && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster={poster}
            aria-hidden="true"
          >
            <source src={videoWebm} type="video/webm" />
            <source src={videoMp4} type="video/mp4" />
          </video>
        )}
        {scrub && <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />}

        {/* Voile de lisibilité côté texte (le film garde un tiers gauche vide). */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(8,10,14,.88)_0%,rgba(8,10,14,.55)_38%,rgba(8,10,14,0)_62%)]" />

        <div className="relative mx-auto flex h-full max-w-6xl items-center px-5 sm:px-8">
          <div className="max-w-xl">
            <div
              className={`transition-all duration-500 ${stage === -1 || !scrub ? "opacity-100" : "pointer-events-none -translate-y-3 opacity-0"}`}
            >
              {children}
            </div>
            {scrub &&
              stages.map((s, i) => (
                <div
                  key={s.title}
                  aria-hidden={stage !== i}
                  className={`absolute top-1/2 max-w-xl -translate-y-1/2 transition-all duration-500 ${
                    stage === i ? "opacity-100" : "pointer-events-none translate-y-[-40%] opacity-0"
                  }`}
                >
                  <p className="text-4xl font-semibold tracking-tight sm:text-6xl">{s.title}</p>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-white/70">{s.text}</p>
                </div>
              ))}
          </div>
        </div>

        {scrub && stage === -1 && (
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.25em] text-white/50">
            {scrollLabel}
          </p>
        )}
      </div>
    </section>
  );
}

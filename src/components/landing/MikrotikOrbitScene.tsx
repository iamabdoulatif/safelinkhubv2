"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { type PlatformStats } from "@/lib/landing/platform-stats";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";

const nf = new Intl.NumberFormat("fr-FR");

function OrbitMetric({
  label,
  value,
  sub,
  countTo,
  className,
}: {
  label: string;
  value?: string;
  sub: string;
  countTo?: number;
  className: string;
}) {
  return (
    <div className={`hero-orbit-orbiter ${className}`}>
      <div className="hero-orbit-metric">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</dt>
        {value ? (
          <dd
            className={`mt-1 font-mono text-xl font-bold tabular-nums text-ink${countTo ? " countup" : ""}`}
            {...(countTo ? { "data-countup": String(countTo) } : {})}
          >
            {value}
          </dd>
        ) : null}
        <p className="mt-1 text-xs leading-5 text-ink-soft">{sub}</p>
      </div>
    </div>
  );
}

export function MikrotikOrbitScene({ stats }: { stats: PlatformStats }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className={`hero-orbit-scene${reducedMotion ? " hero-orbit-scene--reduced-motion" : ""}`}>
      <canvas aria-hidden="true" className="hero-orbit-three-canvas" />
      <div aria-hidden="true" className="hero-orbit-track" />
      <div className="hero-orbit-router">
        <div aria-hidden="true" className="hero-orbit-router-shadow" />
        <Image
          src="/mikrotik/chato.webp"
          alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"
          width={1200}
          height={1200}
          preload
          sizes="(min-width: 1024px) 40vw, (min-width: 640px) 30rem, 92vw"
          className="hero-orbit-image"
        />
      </div>

      <dl className="hero-orbit-metrics">
        <OrbitMetric
          label="Routeurs supervisés"
          value={stats.routers > 0 ? nf.format(stats.routers) : undefined}
          countTo={stats.routers > 0 ? stats.routers : undefined}
          sub="parc total sur la plateforme"
          className="hero-orbit-metric-routers"
        />
        <OrbitMetric
          label="Sessions en cours"
          value={stats.sessions > 0 ? nf.format(stats.sessions) : undefined}
          countTo={stats.sessions > 0 ? stats.sessions : undefined}
          sub="sur les routeurs joignables"
          className="hero-orbit-metric-sessions"
        />
        <OrbitMetric
          label="Essai offert"
          value={`${VPN_TRIAL_DAYS} jours`}
          sub="accès distant, sans carte bancaire"
          className="hero-orbit-metric-trial"
        />
        <OrbitMetric
          label="Mobile money"
          value={String(stats.mobileMoney.length)}
          sub={stats.mobileMoney.join(" · ")}
          className="hero-orbit-metric-money"
        />
      </dl>
    </div>
  );
}

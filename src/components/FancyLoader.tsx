"use client";

/**
 * FancyLoader — Collection de loaders animés pour SafeLinkHub
 *
 * Variantes :
 * - "pulse-ring"    : anneaux concentriques qui pulsent (défaut)
 * - "dots-bounce"   : 3 points qui rebondissent
 * - "spinner-slice" : cercle segmenté qui tourne avec un effet de tranche
 * - "wifi-signal"   : 3 barres qui montent et descendent comme un signal
 * - "router-orbit"  : point qui orbite autour d'un centre
 */

import { cn } from "@/lib/utils";

type FancyLoaderProps = {
  variant?: "pulse-ring" | "dots-bounce" | "spinner-slice" | "wifi-signal" | "router-orbit";
  size?: "sm" | "md" | "lg" | "xl";
  color?: "ink" | "brand" | "white" | "ok";
  label?: string;
  className?: string;
};

const SIZE_MAP = {
  sm: { container: "h-8 w-8", ring: "h-6 w-6", dot: "h-1.5 w-1.5" },
  md: { container: "h-12 w-12", ring: "h-10 w-10", dot: "h-2 w-2" },
  lg: { container: "h-16 w-16", ring: "h-14 w-14", dot: "h-2.5 w-2.5" },
  xl: { container: "h-24 w-24", ring: "h-20 w-20", dot: "h-3.5 w-3.5" },
};

const COLOR_MAP = {
  ink: "border-ink",
  brand: "border-brand",
  white: "border-white",
  ok: "border-ok",
};

const BG_COLOR_MAP = {
  ink: "bg-ink",
  brand: "bg-brand",
  white: "bg-white",
  ok: "bg-ok",
};

export default function FancyLoader({
  variant = "pulse-ring",
  size = "md",
  color = "ink",
  label,
  className,
}: FancyLoaderProps) {
  const s = SIZE_MAP[size];
  const c = COLOR_MAP[color];
  const bg = BG_COLOR_MAP[color];

  if (variant === "pulse-ring") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className={cn("relative flex items-center justify-center", s.container)}>
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-20",
              bg,
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full border-2",
              s.ring,
              c,
            )}
          >
            <span className={cn("absolute inset-0 animate-pulse rounded-full", bg, "opacity-30")} />
          </span>
        </div>
        {label && <p className="text-sm font-medium text-ink-soft animate-pulse">{label}</p>}
      </div>
    );
  }

  if (variant === "dots-bounce") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className="flex items-center gap-1.5">
          <span className={cn("rounded-full", s.dot, bg, "animate-bounce")} style={{ animationDelay: "0ms" }} />
          <span className={cn("rounded-full", s.dot, bg, "animate-bounce")} style={{ animationDelay: "150ms" }} />
          <span className={cn("rounded-full", s.dot, bg, "animate-bounce")} style={{ animationDelay: "300ms" }} />
        </div>
        {label && <p className="text-sm font-medium text-ink-soft animate-pulse">{label}</p>}
      </div>
    );
  }

  if (variant === "spinner-slice") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className={cn("relative", s.container)}>
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-transparent",
              c,
            )}
            style={{
              borderTopColor: "currentColor",
              animation: "spin-slice 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite",
            }}
          />
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-transparent opacity-40",
              c,
            )}
            style={{
              borderRightColor: "currentColor",
              animation: "spin-slice 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite 0.15s",
            }}
          />
        </div>
        {label && <p className="text-sm font-medium text-ink-soft animate-pulse">{label}</p>}
      </div>
    );
  }

  if (variant === "wifi-signal") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className="flex items-end gap-1">
          <span
            className={cn("rounded-full w-1", bg, "animate-signal")}
            style={{ height: "8px", animationDelay: "0ms" }}
          />
          <span
            className={cn("rounded-full w-1", bg, "animate-signal")}
            style={{ height: "16px", animationDelay: "150ms" }}
          />
          <span
            className={cn("rounded-full w-1", bg, "animate-signal")}
            style={{ height: "24px", animationDelay: "300ms" }}
          />
        </div>
        {label && <p className="text-sm font-medium text-ink-soft animate-pulse">{label}</p>}
      </div>
    );
  }

  if (variant === "router-orbit") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div className={cn("relative", s.container)}>
          <div className={cn("absolute inset-0 rounded-full border-2 opacity-20", c)} />
          <div className={cn("absolute inset-2 rounded-full border opacity-10", c)} />
          <div className="absolute inset-0 animate-orbit">
            <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full", s.dot, bg)} />
          </div>
          <div className="absolute inset-0 animate-orbit-reverse">
            <div className={cn("absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full", s.dot, bg, "opacity-60")} />
          </div>
        </div>
        {label && <p className="text-sm font-medium text-ink-soft animate-pulse">{label}</p>}
      </div>
    );
  }

  return null;
}

/* ── LoadingOverlay : plein écran ou conteneur avec fond flouté ── */

export function LoadingOverlay({
  label,
  variant = "spinner-slice",
  size = "lg",
  color = "brand",
  className,
  inline = false,
}: {
  label?: string;
  variant?: FancyLoaderProps["variant"];
  size?: FancyLoaderProps["size"];
  color?: FancyLoaderProps["color"];
  className?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        inline ? "py-12" : "fixed inset-0 z-50 bg-paper/80 backdrop-blur-sm",
        className,
      )}
    >
      <FancyLoader variant={variant} size={size} color={color} />
      {label && (
        <p className="text-base font-medium text-ink animate-pulse">{label}</p>
      )}
    </div>
  );
}

/* ── ButtonLoader : petit spinner à mettre à l'intérieur d'un bouton ── */

export function ButtonLoader({
  size = "sm",
  color = "currentColor",
  className,
}: {
  size?: "xs" | "sm" | "md";
  color?: string;
  className?: string;
}) {
  const s = {
    xs: "h-3.5 w-3.5 border-[1.5px]",
    sm: "h-4 w-4 border-2",
    md: "h-5 w-5 border-2",
  };

  return (
    <div
      className={cn(
        "inline-block rounded-full border-transparent animate-spin",
        s[size],
        className,
      )}
      style={{
        borderTopColor: color,
        borderRightColor: color,
        borderBottomColor: "transparent",
        borderLeftColor: "transparent",
      }}
    />
  );
}

/* ── SkeletonCard : carte squelette pour le chargement de contenu ── */

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line-soft bg-paper p-4 animate-pulse", className)}>
      <div className="h-4 w-1/3 rounded bg-clay" />
      <div className="mt-3 h-24 rounded-lg bg-clay" />
      <div className="mt-3 flex gap-2">
        <div className="h-8 w-20 rounded bg-clay" />
        <div className="h-8 w-20 rounded bg-clay" />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import MockPaymentModal from "./MockPaymentModal";

export type CaptivePreviewData = {
  logoUrl: string;
  primaryColor: string;
  backgroundColor: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  voucherFieldLabel: string;
  termsText: string;
  footerText: string;
  mobileMoneyEnabled?: boolean;
};

const MOBILE_MONEY_PROVIDERS = [
  { id: "paystack", label: "Paystack", className: "bg-[#00C3F9]" },
  { id: "genius_pay", label: "Genius Pay", className: "bg-[#7C3AED]" },
];

export default function CaptivePreview({ data }: { data: CaptivePreviewData }) {
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 p-4 sm:p-6 lg:p-8 text-center"
      style={{ backgroundColor: data.backgroundColor || "#f8fafc" }}
    >
      {data.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.logoUrl} alt="Logo" className="h-12 max-w-[160px] object-contain" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
          Logo
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {data.title || "Bienvenue sur le réseau Wi-Fi"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {data.subtitle || "Entrez votre code d'accès pour vous connecter."}
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <input
          disabled
          placeholder={data.voucherFieldLabel || "Code d'accès"}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 placeholder:text-slate-400"
        />
        <button
          type="button"
          disabled
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: data.primaryColor || "#0f172a" }}
        >
          {data.buttonLabel || "Se connecter"}
        </button>
      </div>

      {data.mobileMoneyEnabled && (
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            ou payer maintenant
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {MOBILE_MONEY_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProvider(p.id)}
                className={`rounded-md px-2 py-2 text-[11px] font-medium text-white ${p.className}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.termsText && (
        <p className="max-w-xs text-[11px] text-slate-400">{data.termsText}</p>
      )}
      {data.footerText && (
        <p className="text-[11px] text-slate-400">{data.footerText}</p>
      )}

      {activeProvider && (
        <MockPaymentModal
          provider={activeProvider}
          onClose={() => setActiveProvider(null)}
        />
      )}
    </div>
  );
}

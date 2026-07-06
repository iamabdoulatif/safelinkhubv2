"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import type { MarketingSettings } from "@/lib/marketing/queries";
import { updateMarketingSettings } from "@/lib/marketing/actions";

const INPUT_CLS =
  "w-full border-2 border-line bg-paper px-3 py-2 text-sm text-ink focus:border-ok focus:outline-none";

export default function MarketingForm({ settings }: { settings: MarketingSettings }) {
  const router = useRouter();
  const [adsenseOn, setAdsenseOn] = useState(settings.adsenseEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateMarketingSettings(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <section className="border-2 border-line bg-paper p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-ink">Analytics &amp; pixels</h2>
        <div className="mt-4 space-y-4">
          <Field
            name="ga4MeasurementId"
            label="Google Analytics — ID de mesure GA4"
            placeholder="G-XXXXXXXXXX"
            defaultValue={settings.ga4MeasurementId}
          />
          <Field
            name="metaPixelId"
            label="Meta Pixel ID"
            placeholder="123456789012345"
            defaultValue={settings.metaPixelId}
          />
          <Field
            name="gtmId"
            label="Google Tag Manager ID"
            placeholder="GTM-XXXXXXX"
            optional
            defaultValue={settings.gtmId}
          />
          <Field
            name="tiktokPixelId"
            label="TikTok Pixel ID"
            placeholder="CXXXXXXXXXXXXXXXXXXX"
            optional
            defaultValue={settings.tiktokPixelId}
          />
        </div>
      </section>

      <section className="border-2 border-line bg-paper p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-ink">Google AdSense (blog)</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Affiche des publicités sur les articles et la liste du blog.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            name="adsenseClientId"
            label="AdSense — ID client (Publisher)"
            placeholder="ca-pub-XXXXXXXXXXXXXXXX"
            defaultValue={settings.adsenseClientId}
          />
          <Field
            name="adsenseSlotId"
            label="AdSense — ID d'emplacement (slot)"
            placeholder="1234567890"
            defaultValue={settings.adsenseSlotId}
          />
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              name="adsenseEnabled"
              checked={adsenseOn}
              onChange={(e) => setAdsenseOn(e.target.checked)}
              className="h-4 w-4 accent-ok"
            />
            <span className="text-sm text-ink">Afficher les publicités sur le blog</span>
          </label>
        </div>
      </section>

      {error && (
        <p className="border-2 border-err bg-err-soft px-3 py-2 text-sm text-err">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 bg-brand-deep px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok">
            <Check className="h-4 w-4" /> Enregistré
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  defaultValue,
  optional,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue: string | null;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft">
        {label}
        {optional && <span className="ml-1 text-ink-soft/60">(optionnel)</span>}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`mt-1 ${INPUT_CLS}`}
      />
    </label>
  );
}

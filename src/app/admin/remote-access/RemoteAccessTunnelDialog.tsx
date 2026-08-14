"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import RemoteAccessTabs from "./RemoteAccessTabs";

export default function RemoteAccessTunnelDialog() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-ink/90"
      >
        Installer un tunnel
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tunnel-dialog-title"
        >
          <section className="h-full w-full max-w-3xl overflow-y-auto bg-paper p-5 shadow-[-8px_0_0_var(--color-brand)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-deep">
                  Accès sécurisé
                </p>
                <h2 id="tunnel-dialog-title" className="mt-1 text-xl font-bold text-ink">
                  Installer un tunnel
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="grid min-h-11 min-w-11 place-items-center border border-line text-ink hover:bg-clay"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <RemoteAccessTabs />
          </section>
        </div>
      )}
    </>
  );
}

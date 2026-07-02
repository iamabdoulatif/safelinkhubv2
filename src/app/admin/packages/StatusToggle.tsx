"use client";

import { useTransition } from "react";
import { togglePackageStatus } from "@/lib/packages/actions";

export default function StatusToggle({
  packageId,
  active,
}: {
  packageId: string;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          togglePackageStatus(packageId);
        })
      }
      className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors disabled:opacity-60 ${
        active ? "bg-ink" : "bg-clay"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-paper transition-transform ${
          active ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

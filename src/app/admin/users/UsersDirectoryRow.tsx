"use client";

import { ChevronRight, MessageCircle } from "lucide-react";
import { roleLabel } from "@/lib/auth/roles";
import { expiryHint } from "./user-expiry";
import { orgDisplayName, quotaShortLabel } from "./user-labels";
import { userMonogram } from "./users-register";
import type { UserControlRow } from "./users-control-center";

export default function UsersDirectoryRow({
  row,
  superadmin,
  now,
  onOpen,
}: {
  row: UserControlRow;
  superadmin: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const expiry = expiryHint(row.quotaExpiresAt, now),
    attention = expiry.tone === "urgent" || expiry.tone === "over";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ouvrir le détail de ${row.name}, ${row.email}, ${roleLabel(row.role)}${superadmin ? `, ${row.orgName}, ${quotaShortLabel(row.quotaCategory) || "Par défaut"}${expiry.label ? `, ${expiry.label}` : ""}` : ""}`}
        className={`grid w-full grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-x-3 gap-y-1 px-4 py-4 text-left transition-colors hover:bg-clay/60 focus-visible:bg-clay/60 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-deep lg:gap-x-4 lg:px-5 ${superadmin ? "lg:grid-cols-[2.25rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem_minmax(0,1fr)_1.25rem]" : "lg:grid-cols-[2.25rem_minmax(0,1fr)_9rem_1.25rem]"}`}
      >
        <span
          aria-hidden="true"
          className="row-span-2 flex h-9 w-9 items-center justify-center self-start rounded-full bg-clay text-xs font-bold text-ink-soft lg:row-span-1 lg:self-center"
        >
          {userMonogram(row.name)}
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-semibold text-ink"
            title={row.name}
          >
            {row.name}
          </span>
          <span
            className="mt-0.5 block truncate text-xs text-ink-soft"
            title={row.email}
          >
            {row.email}
          </span>
        </span>
        <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 lg:contents">
          {superadmin && (
            <span
              className="min-w-0 max-w-full basis-full truncate text-xs text-ink-soft lg:basis-auto lg:text-sm"
              title={row.orgName}
            >
              {orgDisplayName(row.orgName, row.name) || row.orgName}
            </span>
          )}
          <span
            className={`w-fit max-w-full rounded-md px-2 py-1 text-[11px] font-medium ${row.role === "superadmin" ? "bg-slate-deep text-white" : "bg-clay text-ink-soft"}`}
          >
            {roleLabel(row.role)}
          </span>
          {superadmin && (
            <span className="min-w-0 text-xs lg:text-sm">
              <span className="block text-ink">
                {quotaShortLabel(row.quotaCategory) || "Par défaut"}
              </span>
              {expiry.label && (
                <span
                  className={`mt-0.5 block text-xs ${attention ? "font-medium text-err" : "text-ink-soft"}`}
                >
                  {expiry.label}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="col-start-3 row-span-2 row-start-1 h-4 w-4 text-ink-soft lg:col-start-auto lg:row-span-1 lg:row-start-auto"
        />
      </button>
      {row.whatsapp && (
        <a
          href={`https://wa.me/${row.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-1 flex min-h-9 items-center gap-1.5 px-4 pb-2 pl-[4.25rem] text-xs text-brand-deep hover:underline lg:pl-[4.5rem]"
        >
          <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">WhatsApp · {row.whatsapp}</span>
        </a>
      )}
    </li>
  );
}

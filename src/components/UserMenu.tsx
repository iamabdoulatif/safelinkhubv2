"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Loader2, LogOut, Shield, User as UserIcon } from "lucide-react";
import { logout } from "@/lib/auth/actions";

export default function UserMenu({
  userName,
  userEmail,
  superadmin,
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  superadmin: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const navRouter = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <div ref={containerRef} className="relative border-t-2 border-line p-3">
      {open && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute bottom-full left-3 right-3 mb-2 animate-fade-in-up overflow-hidden border-2 border-line bg-paper"
        >
          <div className="flex items-center gap-3 border-b-2 border-line-soft px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink font-display text-xs font-bold text-paper">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{userName}</p>
              <p className="truncate text-xs text-ink-soft">{userEmail}</p>
            </div>
          </div>

          <span
            className={`mx-3 mt-2 inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${
              superadmin ? "bg-ink text-brand" : "bg-clay text-ink-soft"
            }`}
          >
            <Shield className="h-3 w-3" />
            {superadmin ? "Superadmin" : "Admin"}
          </span>

          <div className="p-1.5">
            <Link
              href="/admin/profile"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-clay hover:text-ink"
            >
              <UserIcon className="h-4 w-4 flex-shrink-0" />
              Mon profil
            </Link>

            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => {
                startLogout(async () => {
                  await logout();
                  navRouter.replace("/auth/login");
                });
              }}
              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-sm font-bold text-err transition-colors hover:bg-clay disabled:opacity-60"
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 flex-shrink-0" />
              )}
              Déconnexion
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors hover:bg-clay"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink font-display text-xs font-bold text-paper">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{userName}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            {superadmin ? "Superadmin" : "Admin"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-soft" />
      </button>
    </div>
  );
}

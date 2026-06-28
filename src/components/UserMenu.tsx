"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LogOut, Shield, User as UserIcon } from "lucide-react";
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
    <div ref={containerRef} className="relative border-t border-slate-200 p-3">
      {open && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute bottom-full left-3 right-3 mb-2 animate-fade-in-up overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
            </div>
          </div>

          <span
            className={`mx-3 mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              superadmin ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"
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
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <UserIcon className="h-4 w-4 flex-shrink-0" />
              Mon profil
            </Link>

            <form action={logout}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{userName}</span>
          <span className="block truncate text-xs text-slate-400">
            {superadmin ? "Superadmin" : "Admin"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    </div>
  );
}

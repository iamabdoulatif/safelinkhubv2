import {
  Bell,
  ChevronLeft,
  ChevronRight,
  House,
  Plus,
  Radio,
  UserRound,
  UsersRound,
  Wifi,
} from "lucide-react";

const team = [
  { initials: "YA", name: "Yao Kouassi", detail: "Vendeur · Wi-Fi Zone Cocody" },
  { initials: "SA", name: "Sarah N’Guessan", detail: "Vendeur · Wi-Fi Zone Cocody" },
];

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-[30px] place-items-center rounded-[10px] bg-[#eef5f0] text-[#477d68] transition-colors hover:bg-[#d9f0e5]"
    >
      {children}
    </button>
  );
}

export default function OperatorDashboard() {
  return (
    <main className="min-h-dvh bg-[#fbfdfb] text-[#172b23]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[402px] flex-col overflow-hidden rounded-[38px] bg-[#fbfdfb]">
        <div className="flex h-[112px] shrink-0 items-center justify-between px-5 pb-3 pt-16">
          <div aria-hidden="true" className="size-[30px]" />
          <div className="flex items-start gap-2">
            <IconButton label="Retour">
              <ChevronLeft size={20} strokeWidth={1.7} />
            </IconButton>
            <IconButton label="Notifications">
              <Bell size={18} strokeWidth={1.7} />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] text-[#1f9d72]">VUE GLOBALE</p>
              <h1 className="pt-2 text-[20px] font-bold leading-6 tracking-[-0.055em]">Tout est sous contrôle.</h1>
            </div>
            <div className="grid size-9 place-items-center rounded-xl bg-[#d9f0e5] text-[10px] font-extrabold text-[#288468]">
              AD
            </div>
          </section>

          <section className="mt-4 flex h-28 items-center gap-4 rounded-2xl bg-[linear-gradient(156deg,#193e32_6%,#28614d_94%)] p-4 shadow-[0_12px_12px_rgba(23,68,50,0.09)]">
            <div className="grid size-14 shrink-0 place-items-center rounded-full border-4 border-[#3dbc8c] text-center text-white">
              <span className="text-[18px] font-extrabold leading-4">98<small className="block text-[10px] leading-3">%</small></span>
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold leading-[18px] text-white">Santé du système</h2>
              <p className="mt-1 text-[9px] leading-[13px] text-[#bad9c9]">Réseau de démonstration</p>
              <span className="mt-2 inline-flex rounded-full bg-[#e3f8ed] px-2 py-[3px] text-[8px] leading-3 text-[#29815b]">● Stable</span>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3" aria-label="Résumé du réseau">
            <SummaryCard label="Zones configurées" value="1" hint="Votre réseau Wi-Fi" />
            <SummaryCard label="Vendeurs" value="2" hint="Équipe du réseau" />
          </section>

          <section className="mt-4 rounded-2xl border border-[#e4ece7] bg-white p-4">
            <SectionHeading title="Mes zones" action="Ajouter" icon={<Plus size={12} />} />
            <div className="flex items-center gap-3 pt-6">
              <div className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-[#e1f3e9] text-[#288365]">
                <Wifi size={18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-4">Wi-Fi Zone Cocody</p>
                <p className="pt-[3px] text-[9px] leading-[14px] text-[#75877e]">Abidjan · Cocody</p>
              </div>
              <ChevronRight size={14} strokeWidth={1.5} />
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-[#e4ece7] bg-white p-4">
            <SectionHeading title="Mon équipe" action="Voir tout" />
            <div className="pt-3">
              {team.map((member, index) => (
                <div key={member.initials} className={`flex items-center gap-3 py-3 ${index === 0 ? "border-b border-[#edf2ee]" : ""}`}>
                  <div className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-[#e1f3e9] font-mono text-[9px] text-[#288365]">
                    {member.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold leading-4">{member.name}</p>
                    <p className="pt-[3px] text-[9px] leading-[14px] text-[#75877e]">{member.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <nav className="grid h-[78px] shrink-0 grid-cols-4 border-t border-[#e4ece7] bg-white px-5 pb-4 pt-3" aria-label="Navigation principale">
          <NavItem label="Accueil" active><House size={20} strokeWidth={1.7} /></NavItem>
          <NavItem label="Équipe"><UsersRound size={20} strokeWidth={1.7} /></NavItem>
          <NavItem label="Activité"><Radio size={20} strokeWidth={1.7} /></NavItem>
          <NavItem label="Profil"><UserRound size={20} strokeWidth={1.7} /></NavItem>
        </nav>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#e4ece7] bg-white p-4">
      <p className="truncate text-[10px] leading-[15px] text-[#75877e]">{label}</p>
      <p className="py-[6px] text-[21px] font-bold leading-8 tracking-[-0.055em]">{value}</p>
      <p className="truncate text-[9px] leading-[14px] text-[#1f9d72]">{hint}</p>
    </div>
  );
}

function SectionHeading({ title, action, icon }: { title: string; action: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-extrabold tracking-[-0.02em]">{title}</h2>
      <button type="button" className="flex items-center gap-1 py-1 text-[10px] font-bold text-[#1f9d72]">
        {icon}
        {action}
        {!icon && <span aria-hidden="true">›</span>}
      </button>
    </div>
  );
}

function NavItem({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <a href="#" className={`flex flex-col items-center gap-1 text-[9px] ${active ? "text-[#1f9d72]" : "text-[#9ca9a3]"}`}>
      {children}
      <span>{label}</span>
    </a>
  );
}

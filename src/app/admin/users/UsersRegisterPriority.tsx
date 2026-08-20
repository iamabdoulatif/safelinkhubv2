import { Building2, CircleAlert, CreditCard, Gift, Router, Users } from "lucide-react";
import type { OrganizationFocus } from "./organization-focus";
import type { UsersRegisterSummary } from "./users-register";

type UsersRegisterPriorityProps = {
  summary: UsersRegisterSummary;
  focusedOrganization: OrganizationFocus | null;
};

type PriorityCell = {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Building2;
  urgent?: boolean;
  highlighted?: boolean;
  dividerClassName?: string;
};

function PriorityCell({ label, value, hint, icon: Icon, urgent = false, highlighted = false, dividerClassName = "" }: PriorityCell) {
  const emphasisClass = urgent ? "text-err" : "text-ink";

  return (
    <div className={`min-w-0 p-4 ${highlighted ? "bg-brand/15" : "bg-paper"} ${dividerClassName}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        <Icon className={`h-4 w-4 shrink-0 ${emphasisClass}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-3 truncate text-3xl font-semibold tracking-tight ${emphasisClass}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

export function UsersRegisterPriority({ summary, focusedOrganization }: UsersRegisterPriorityProps) {
  const dividerClassNames = [
    "border-b border-line sm:border-r xl:border-b-0",
    "border-b border-line xl:border-r xl:border-b-0",
    "border-b border-line sm:border-r sm:border-b-0 xl:border-r",
    "",
  ];
  const cells: PriorityCell[] = focusedOrganization
    ? [
        {
          label: "Organisation ciblée",
          value: focusedOrganization.name,
          hint: "Vue limitée aux données autorisées",
          icon: Building2,
        },
        { label: "Membres visibles", value: focusedOrganization.memberCount, hint: "comptes suivis", icon: Users },
        { label: "Routeurs du parc", value: focusedOrganization.routerCounts.total, hint: "équipements liés", icon: Router },
        {
          label: "À traiter",
          value: summary.attentionCount,
          hint: "échéance dans 30 jours",
          icon: CircleAlert,
          urgent: summary.attentionCount > 0,
        },
      ]
    : [
        {
          label: "À traiter maintenant",
          value: summary.attentionCount,
          hint: "échéance dans 30 jours",
          icon: CircleAlert,
          urgent: summary.attentionCount > 0,
          highlighted: true,
        },
        { label: "Quota gratuit", value: summary.freeCount, hint: "accès offerts ou illimités", icon: Gift },
        { label: "VPN payant", value: summary.paidCount, hint: "comptes suivis", icon: CreditCard },
        { label: "Organisations actives", value: summary.organizationCount, hint: "structures visibles", icon: Building2 },
      ];

  return (
    <section aria-label="Repères du registre" className="grid border border-line bg-paper sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell, index) => <PriorityCell key={cell.label} {...cell} dividerClassName={dividerClassNames[index] ?? ""} />)}
    </section>
  );
}

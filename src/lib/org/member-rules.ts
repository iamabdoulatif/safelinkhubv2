/**
 * Règles d'appartenance à une organisation — fonctions PURES, testables sans
 * base. Les actions serveur ne font que lire l'état et appliquer ces verdicts.
 */
import { isRole, type Role } from "@/lib/auth/roles";

export type Verdict = { ok: true } | { ok: false; error: string };

const OK = { ok: true } as const;

/**
 * Un rôle assignable est un rôle de `ROLES` — jamais « superadmin ».
 *
 * Sans ce refus, un administrateur d'organisation se fabriquerait un
 * superadmin en postant la chaîne à la main : le rôle donne accès à TOUTES les
 * organisations du SaaS.
 */
export function guardAssignRole(role: string): Verdict {
  if (role === "superadmin") {
    return { ok: false, error: "Le rôle superadmin ne s'attribue pas depuis un compte." };
  }
  if (!isRole(role)) return { ok: false, error: "Rôle inconnu." };
  return OK;
}

/**
 * Retrait d'un membre.
 *
 * Deux refus : se retirer soi-même (on se couperait l'accès en un clic, sans
 * personne pour revenir en arrière) et retirer le DERNIER administrateur, qui
 * laisserait l'organisation sans personne capable d'inviter, de payer ou de
 * changer les réglages.
 */
export function guardRemoveMember(params: {
  actorUserId: string;
  targetUserId: string;
  targetRole: string;
  adminCount: number;
}): Verdict {
  if (params.actorUserId === params.targetUserId) {
    return { ok: false, error: "Vous ne pouvez pas vous retirer vous-même du compte." };
  }
  const cibleEstAdmin = params.targetRole === "admin" || params.targetRole === "superadmin";
  if (cibleEstAdmin && params.adminCount <= 1) {
    return {
      ok: false,
      error: "C'est le dernier administrateur du compte : nommez-en un autre avant de le retirer.",
    };
  }
  return OK;
}

/** Changement de rôle : mêmes garde-fous, plus le refus de se rétrograder. */
export function guardChangeRole(params: {
  actorUserId: string;
  targetUserId: string;
  currentRole: string;
  nextRole: string;
  adminCount: number;
}): Verdict {
  const assignable = guardAssignRole(params.nextRole);
  if (!assignable.ok) return assignable;
  if (params.currentRole === params.nextRole) return OK;

  if (params.actorUserId === params.targetUserId) {
    return { ok: false, error: "Vous ne pouvez pas changer votre propre rôle." };
  }
  const perdAdmin =
    (params.currentRole === "admin" || params.currentRole === "superadmin") &&
    params.nextRole !== "admin";
  if (perdAdmin && params.adminCount <= 1) {
    return {
      ok: false,
      error: "C'est le dernier administrateur du compte : nommez-en un autre avant de le rétrograder.",
    };
  }
  return OK;
}

/** Invitation : l'adresse doit être plausible et le rôle assignable. */
export function guardInvite(params: {
  email: string;
  role: string;
  membresExistants: readonly string[];
  invitationsOuvertes: readonly string[];
}): Verdict & { email?: string } {
  const email = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  const assignable = guardAssignRole(params.role);
  if (!assignable.ok) return assignable;

  if (params.membresExistants.some((m) => m.toLowerCase() === email)) {
    return { ok: false, error: "Cette personne fait déjà partie du compte." };
  }
  if (params.invitationsOuvertes.some((m) => m.toLowerCase() === email)) {
    return { ok: false, error: "Une invitation est déjà en attente pour cette adresse." };
  }
  return { ok: true, email };
}

export type { Role };

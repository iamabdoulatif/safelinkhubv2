// Classes partagées des formulaires d'authentification.
//
// Ces cinq chaînes étaient recopiées à l'identique dans LoginForm,
// RegisterForm, ForgotPasswordForm, ResetPasswordForm, ActivateForm et
// ResendActivationForm. Au passage en peau Slate, il fallait les modifier six
// fois — et rien n'empêchait d'en oublier une. Un seul endroit désormais.
//
// Peau Slate (voir .theme-slate dans globals.css) : traits de 1 px, coins
// arrondis, anneau de focus lime, bouton pilule.

export const fieldBase =
  "w-full rounded-lg border border-line bg-paper py-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand";

/** Champ avec icône à gauche (Mail, Lock…) — d'où le padding gauche. */
export const fieldClass = `${fieldBase} pl-10 pr-3`;

/** Champ avec icône à gauche ET bouton œil à droite. */
export const fieldClassWithToggle = `${fieldBase} pl-10 pr-10`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

export const buttonClass =
  "inline-flex w-full items-center justify-center gap-2 slate-btn slate-btn-primary px-5 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60";

/** Encart d'information discret (fond crème, trait fin). */
export const noticeClass =
  "flex items-start gap-2 rounded-lg border border-line bg-clay px-3 py-2.5 text-sm text-ink-soft";

/** Encart d'erreur. */
export const errorClass =
  "flex items-center gap-2 rounded-lg border border-err bg-err-soft px-3 py-2.5 text-sm font-semibold text-err";

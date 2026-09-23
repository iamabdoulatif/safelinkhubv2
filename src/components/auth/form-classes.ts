// Classes partagées des formulaires d'authentification.
//
// Ces cinq chaînes étaient recopiées à l'identique dans LoginForm,
// RegisterForm, ForgotPasswordForm, ResetPasswordForm, ActivateForm et
// ResendActivationForm. Au passage en peau Slate, il fallait les modifier six
// fois — et rien n'empêchait d'en oublier une. Un seul endroit désormais.
//
// Peau Slate (voir .theme-slate dans globals.css) : traits de 1 px, coins
// arrondis, bouton pilule. Champs et bouton = composants partagés (.field, .btn).

// Style commun des champs : classe .field (globals.css). Les pages d'auth
// gardent un champ un peu plus haut (48 px) : c'est la seule action de l'écran.
export const fieldBase = "field h-12 sm:h-12";

/** Champ avec icône à gauche (Mail, Lock…) — d'où le padding gauche. */
export const fieldClass = `${fieldBase} pl-10 pr-3`;

/** Champ avec icône à gauche ET bouton œil à droite. */
export const fieldClassWithToggle = `${fieldBase} pl-10 pr-10`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

export const buttonClass = "btn btn-lg btn-primary w-full";

/** Encart d'information discret (fond crème, trait fin). */
export const noticeClass =
  "flex items-start gap-2 rounded-lg border border-line bg-clay px-3 py-2.5 text-sm text-ink-soft";

/** Encart d'erreur. */
export const errorClass =
  "flex items-center gap-2 rounded-lg border border-err bg-err-soft px-3 py-2.5 text-sm font-semibold text-err";

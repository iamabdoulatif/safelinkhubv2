const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*-_=+?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function randomChar(set: string): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return set[bytes[0] % set.length];
}

/** At least one of each character class, shuffled, 14 chars by default. */
export function generateStrongPassword(length = 14): string {
  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(ALL));
  const chars = [...required, ...rest];

  // Fisher-Yates, using crypto for the shuffle too rather than Math.random.
  for (let i = chars.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return "empty";

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}

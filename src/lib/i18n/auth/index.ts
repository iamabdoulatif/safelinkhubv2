import { authEn } from "./en";
import { authFr } from "./fr";
import type { Locale } from "../config";

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Widen<U>[] : { -readonly [K in keyof T]: Widen<T[K]> };
export type AuthDictionary = Widen<typeof authFr>;

export function getAuthDictionary(locale: Locale): AuthDictionary {
  return locale === "en" ? authEn : authFr;
}

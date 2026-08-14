/**
 * Some RouterOS Container builds can create `/container/envs` entries but
 * reject the `envlist` property when creating or updating a container. Keep
 * the retry deliberately narrow so genuine container errors still surface.
 */
export function isUnsupportedEnvlistError(error: string): boolean {
  return error.trim().toLowerCase() === "unknown parameter envlist";
}

/** Removes only the RouterOS `envlist` argument from an API command. */
export function withoutEnvlist(command: string[]): string[] {
  return command.filter((word) => !word.startsWith("=envlist="));
}

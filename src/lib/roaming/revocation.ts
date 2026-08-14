type NamedTarget = { name: string };

export type RoamingRevocationResult = {
  removedOn: number;
  unreachable: string[];
};

/**
 * Révoque chaque zone indépendamment : une liaison muette ne doit pas faire
 * attendre les zones déjà joignables. Le résultat conserve les noms échoués
 * pour que l'appelant puisse garder la ligne SaaS et proposer une relance sûre.
 */
export async function revokeRoamingTargets<T extends NamedTarget>(
  targets: readonly T[],
  revoke: (target: T) => Promise<void>,
): Promise<RoamingRevocationResult> {
  const outcomes = await Promise.all(
    targets.map(async (target) => {
      try {
        await revoke(target);
        return { name: target.name, removed: true } as const;
      } catch {
        return { name: target.name, removed: false } as const;
      }
    }),
  );

  return {
    removedOn: outcomes.filter((outcome) => outcome.removed).length,
    unreachable: outcomes.filter((outcome) => !outcome.removed).map((outcome) => outcome.name),
  };
}

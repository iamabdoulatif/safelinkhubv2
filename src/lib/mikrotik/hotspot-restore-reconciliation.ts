/** Une ligne de table RouterOS lue depuis une sauvegarde ou le routeur cible. */
export type HotspotRestoreRow = Record<string, string>;

export type ResolvedHotspotTicket = {
  name: string;
  /** Nom du profil réellement présent sur la cible, jamais un ID `*…` source. */
  profile: string;
  /** Serveur HotSpot activé de la cible. */
  server: string;
  /** Champs sûrs à transmettre à `/ip/hotspot/user/add` ou `/set`. */
  fields: Record<string, string>;
};

export type HotspotProfileBinding = {
  name: string;
  /** Pool lu sur le serveur HotSpot cible actif. */
  addressPool: string;
  /** File locale conservée si elle est nommée, sinon valeur RouterOS sûre. */
  parentQueue: string;
};

export type HotspotRestorePreparation = {
  blockers: string[];
  tickets: ResolvedHotspotTicket[];
  profileBindings: HotspotProfileBinding[];
  /** Profils dont une référence de file opaque a été remplacée par `none`. */
  parentQueueAdaptations: string[];
};

const TICKET_FIELDS = [
  "name",
  "password",
  "comment",
  "disabled",
  "limit-uptime",
  "limit-bytes-total",
  "email",
  "address",
  "mac-address",
  "routes",
] as const;

function hasUsableName(row: HotspotRestoreRow): row is HotspotRestoreRow & { name: string } {
  return !!row.name?.trim();
}

function isSourceInternalReference(value: string | undefined) {
  return !!value?.trim().startsWith("*");
}

function ticketFields(ticket: HotspotRestoreRow, profile: string, server: string) {
  const fields: Record<string, string> = {};
  for (const field of TICKET_FIELDS) {
    const value = ticket[field];
    if (value !== undefined && value !== "") fields[field] = value;
  }
  fields.name = ticket.name!;
  // Ces deux valeurs sont les SEULES autorités topologiques envoyées au routeur.
  fields.profile = profile;
  fields.server = server;
  return fields;
}

/**
 * Prépare les écritures HotSpot à partir d'une sauvegarde, sans I/O RouterOS.
 *
 * Une même sauvegarde peut utiliser les IDs internes de la source (`*1`) ou les
 * noms de profil. La cible n'accepte que ses propres objets : cette fonction
 * résout donc toutes les références avant que le moteur ne crée un ticket.
 */
export function prepareHotspotRestore(args: {
  sourceProfiles: HotspotRestoreRow[];
  sourceTickets: HotspotRestoreRow[];
  targetProfiles: HotspotRestoreRow[];
  targetServers: HotspotRestoreRow[];
}): HotspotRestorePreparation {
  const blockers: string[] = [];
  const sourceProfiles = args.sourceProfiles.filter(hasUsableName);
  const targetProfiles = args.targetProfiles.filter(hasUsableName);
  const activeServers = args.targetServers.filter(
    (server) => hasUsableName(server) && server.disabled !== "true",
  );

  if (activeServers.length !== 1) {
    blockers.push(
      `Le rechange doit avoir exactement un serveur HotSpot activé ; ${activeServers.length} trouvé(s).`,
    );
  }
  const targetServer = activeServers[0];
  const addressPool = targetServer?.["address-pool"]?.trim() ?? "";
  if (targetServer && !addressPool) {
    blockers.push(
      `Le serveur HotSpot cible « ${targetServer.name} » n'a pas de pool IP configuré.`,
    );
  }

  const sourceProfileNameByReference = new Map<string, string>();
  for (const profile of sourceProfiles) {
    sourceProfileNameByReference.set(profile.name, profile.name);
    if (profile[".id"]) sourceProfileNameByReference.set(profile[".id"], profile.name);
  }
  const targetProfileByName = new Map(targetProfiles.map((profile) => [profile.name, profile]));

  const ticketCandidates: { ticket: HotspotRestoreRow; profile: string }[] = [];
  for (const ticket of args.sourceTickets) {
    if (!hasUsableName(ticket) || ticket.default === "true") continue;
    const sourceReference = ticket.profile?.trim();
    if (!sourceReference) {
      blockers.push(`Le ticket « ${ticket.name} » n'a pas de profil source à traduire.`);
      continue;
    }
    const profileName = sourceProfileNameByReference.get(sourceReference);
    if (!profileName) {
      blockers.push(
        `Le ticket « ${ticket.name} » référence le profil source inconnu « ${sourceReference} » .`,
      );
      continue;
    }
    if (!targetProfileByName.has(profileName)) {
      blockers.push(
        `Le profil « ${profileName} » requis par le ticket « ${ticket.name} » est absent de la cible après synchronisation.`,
      );
      continue;
    }
    ticketCandidates.push({ ticket, profile: profileName });
  }

  if (blockers.length > 0 || !targetServer || !addressPool) {
    return { blockers, tickets: [], profileBindings: [], parentQueueAdaptations: [] };
  }

  const parentQueueAdaptations: string[] = [];
  const profileBindings: HotspotProfileBinding[] = [];
  for (const sourceProfile of sourceProfiles) {
    if (sourceProfile.name === "default") continue;
    const targetProfile = targetProfileByName.get(sourceProfile.name);
    // L'absence de ce profil a déjà bloqué les tickets qui en dépendent. Le
    // conserver absent est acceptable s'il n'est associé à aucun ticket.
    if (!targetProfile) continue;
    const currentParentQueue = targetProfile["parent-queue"]?.trim() ?? "";
    const parentQueue =
      currentParentQueue && !isSourceInternalReference(currentParentQueue)
        ? currentParentQueue
        : "none";
    if (parentQueue === "none" && currentParentQueue !== "none") {
      parentQueueAdaptations.push(sourceProfile.name);
    }
    profileBindings.push({ name: sourceProfile.name, addressPool, parentQueue });
  }

  return {
    blockers: [],
    tickets: ticketCandidates.map(({ ticket, profile }) => ({
      name: ticket.name,
      profile,
      server: targetServer.name,
      fields: ticketFields(ticket, profile, targetServer.name),
    })),
    profileBindings,
    parentQueueAdaptations,
  };
}

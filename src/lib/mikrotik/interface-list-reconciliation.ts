export type RequiredInterfaceListMember = {
  list: string;
  interface: string;
};

function stringField(row: object, field: string): string | undefined {
  const value = (row as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** Returns the RouterOS interface-list names that still need creating. */
export function getMissingInterfaceListNames(
  existing: readonly object[],
  required: readonly string[],
): string[] {
  return [...new Set(required)].filter(
    (name) => !existing.some((row) => stringField(row, "name") === name),
  );
}

/** Returns only memberships that are not already present on the router. */
export function getMissingInterfaceListMembers(
  existing: readonly object[],
  required: readonly RequiredInterfaceListMember[],
): RequiredInterfaceListMember[] {
  return required.filter(
    (member, index) =>
      required.findIndex(
        (candidate) =>
          candidate.list === member.list && candidate.interface === member.interface,
      ) === index &&
      !existing.some(
        (row) =>
          stringField(row, "list") === member.list &&
          stringField(row, "interface") === member.interface,
      ),
  );
}

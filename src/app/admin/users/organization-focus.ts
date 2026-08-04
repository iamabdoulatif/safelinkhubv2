type Organization = {
  id: string;
  name: string;
};

export function resolveFocusedOrganization<T extends Organization>(
  isSuperadmin: boolean,
  requestedOrgId: string | null | undefined,
  organizations: T[],
): T | null {
  if (!isSuperadmin || !requestedOrgId) return null;

  return organizations.find((organization) => organization.id === requestedOrgId) ?? null;
}

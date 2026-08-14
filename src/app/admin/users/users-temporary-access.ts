export async function loadUsersTemporaryAccessPayload<T>({
  superadmin,
  focusedOrganization,
  load,
}: {
  superadmin: boolean;
  focusedOrganization: boolean;
  load: () => Promise<T>;
}): Promise<T | null> {
  if (!superadmin || focusedOrganization) return null;

  return load();
}

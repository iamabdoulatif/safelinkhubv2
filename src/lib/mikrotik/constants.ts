// Shared constants — kept in a plain module (no "use server") so they can be
// imported by both server-action files and the "use server" exports rule
// ("only async functions may be exported") doesn't apply here.

// Public port the "ACCES DISTANT" dst-nat rule forwards to the MikHmon
// container, opened directly on the router's own WAN by provisionHotspotStack.
export const REMOTE_ACCESS_PORT = 8088;

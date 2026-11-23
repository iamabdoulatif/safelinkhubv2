import { bearerMatches } from "@/lib/auth/bearer";

export function n8nAuthorized(request: Request): boolean {
  return bearerMatches(request, process.env.N8N_INTERNAL_TOKEN);
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

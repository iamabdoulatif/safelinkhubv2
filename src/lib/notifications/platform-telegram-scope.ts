import { and, eq, exists } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { routers, users } from '@/lib/db/schema';

/** Legacy n8n sends to a platform-owned recipient; tenant alerts have a separate outbox. */
export function platformTelegramRouterScope(db = getDb()) {
  return exists(db.select({id:users.id}).from(users).where(and(eq(users.orgId,routers.orgId),eq(users.role,'superadmin'))));
}

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

async function main() {
  const orgName = "Kirowoza";
  const slug = "kirowoza";
  const adminEmail = "admin@safelinkhub.net";
  const adminPassword = "safelinkhub1234";

  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(schema.organizations)
      .values({ name: orgName, slug })
      .returning();
    console.log("Created organization:", org.name);
  }

  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .limit(1);

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.insert(schema.users).values({
      orgId: org.id,
      name: "Admin",
      email: adminEmail,
      passwordHash,
      role: "admin",
    });
    console.log("Created admin user:", adminEmail, "/", adminPassword);
  } else {
    console.log("Admin user already exists:", adminEmail);
  }

  const existingPackages = await db
    .select({ id: schema.packages.id })
    .from(schema.packages)
    .where(eq(schema.packages.orgId, org.id));

  if (existingPackages.length === 0) {
    await db.insert(schema.packages).values([
      { orgId: org.id, name: "2 Hours", priceCents: 500, durationValue: 2, durationUnit: "Hours", uploadMbps: 5, downloadMbps: 5 },
      { orgId: org.id, name: "6 Hours", priceCents: 1000, durationValue: 6, durationUnit: "Hours", uploadMbps: 5, downloadMbps: 5 },
      { orgId: org.id, name: "12 Hours", priceCents: 1500, durationValue: 12, durationUnit: "Hours", uploadMbps: 5, downloadMbps: 5 },
      { orgId: org.id, name: "24 Hours", priceCents: 2000, durationValue: 1, durationUnit: "Days", uploadMbps: 5, downloadMbps: 5 },
      { orgId: org.id, name: "Week", priceCents: 12000, durationValue: 7, durationUnit: "Days", uploadMbps: 5, downloadMbps: 5 },
    ]);
    console.log("Seeded default packages");
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

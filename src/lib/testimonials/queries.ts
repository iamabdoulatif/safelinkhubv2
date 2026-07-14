import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { testimonials } from "@/lib/db/schema";

export type Testimonial = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  quote: string;
  rating: number | null;
  status: string;
  createdAt: Date;
};

/** Témoignages approuvés pour la landing publique. Tolère l'absence de table
 * (migration non encore appliquée) → renvoie [] au lieu de planter la home. */
export async function getApprovedTestimonials(limit = 12): Promise<Testimonial[]> {
  if (!process.env.DATABASE_URL) return [];

  const db = getDb();
  return db
    .select()
    .from(testimonials)
    .where(eq(testimonials.status, "approved"))
    .orderBy(desc(testimonials.createdAt))
    .limit(limit)
    .catch(() => [] as Testimonial[]);
}

/** Tous les témoignages, pour la modération admin. */
export async function getAllTestimonials(): Promise<Testimonial[]> {
  if (!process.env.DATABASE_URL) return [];

  const db = getDb();
  return db
    .select()
    .from(testimonials)
    .orderBy(desc(testimonials.createdAt))
    .catch(() => [] as Testimonial[]);
}

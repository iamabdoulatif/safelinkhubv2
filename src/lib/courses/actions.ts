"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseLessons, courses } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

async function requireSuperAdminSession() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return null;
  return session;
}

/* Même slugification que les articles, volontairement recopiée telle quelle :
 * un slug de formation et un slug d'article doivent se lire pareil, et les
 * factoriser ferait dépendre le module formations du module blog pour cinq
 * lignes sans logique métier. */
function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function refresh(slug?: string) {
  revalidatePath("/formations");
  revalidatePath("/en/formations");
  if (slug) {
    revalidatePath(`/formations/${slug}`);
    revalidatePath(`/en/formations/${slug}`);
  }
  revalidatePath("/admin/formations");
}

export async function saveCourse(_prevState: unknown, formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return { error: "Accès réservé au superadmin." };

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim();
  const published = formData.get("published") === "on";
  const positionRaw = Number(formData.get("position") ?? 0);
  const position = Number.isInteger(positionRaw) ? positionRaw : 0;

  if (!title) return { error: "Le titre est requis." };
  if (coverImageUrl && !/^(\/|https:\/\/)/.test(coverImageUrl)) {
    return { error: "L'image de couverture doit être un chemin (/formations/…) ou une URL https." };
  }

  const slug = slugify(String(formData.get("slug") ?? "").trim() || title);
  if (!slug) return { error: "Impossible de générer un slug à partir du titre." };

  const db = getDb();
  const doublon = await db
    .select({ id: courses.id })
    .from(courses)
    .where(id ? and(eq(courses.slug, slug), ne(courses.id, id)) : eq(courses.slug, slug))
    .limit(1);
  if (doublon.length > 0) {
    return { error: `Le slug « ${slug} » est déjà pris par une autre formation.` };
  }

  if (id) {
    const [existant] = await db
      .select({ publishedAt: courses.publishedAt })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (!existant) return { error: "Formation introuvable." };

    await db
      .update(courses)
      .set({
        title,
        slug,
        summary: summary || null,
        level: level || null,
        coverImageUrl: coverImageUrl || null,
        published,
        position,
        // Fixée à la PREMIÈRE publication et conservée ensuite : dépublier puis
        // republier ne doit pas faire remonter la formation en tête de liste.
        publishedAt: published ? (existant.publishedAt ?? new Date()) : existant.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id));
    refresh(slug);
    return { success: true as const, id };
  }

  const [cree] = await db
    .insert(courses)
    .values({
      title,
      slug,
      summary: summary || null,
      level: level || null,
      coverImageUrl: coverImageUrl || null,
      published,
      position,
      publishedAt: published ? new Date() : null,
      createdBy: session.userId,
    })
    .returning({ id: courses.id });
  refresh(slug);
  return { success: true as const, id: cree.id };
}

export async function deleteCourse(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  // Les leçons partent en cascade avec la formation.
  await getDb().delete(courses).where(eq(courses.id, id));
  refresh();
}

export async function saveLesson(_prevState: unknown, formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return { error: "Accès réservé au superadmin." };

  const id = String(formData.get("id") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const videoUrl = String(formData.get("videoUrl") ?? "").trim();
  const dureeRaw = Number(formData.get("durationMinutes") ?? 0);
  const durationMinutes = Number.isInteger(dureeRaw) && dureeRaw > 0 ? dureeRaw : null;

  if (!courseId) return { error: "Formation manquante." };
  if (!title || !content) return { error: "Le titre et le contenu de la leçon sont requis." };
  if (videoUrl && !/^https:\/\//.test(videoUrl)) {
    return { error: "Le lien vidéo doit être une URL https." };
  }

  const db = getDb();
  const [formation] = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!formation) return { error: "Formation introuvable." };

  if (id) {
    await db
      .update(courseLessons)
      .set({ title, content, videoUrl: videoUrl || null, durationMinutes, updatedAt: new Date() })
      .where(and(eq(courseLessons.id, id), eq(courseLessons.courseId, courseId)));
    refresh(formation.slug);
    return { success: true as const };
  }

  /* La nouvelle leçon se range à la fin. Reprendre le compte des leçons
     donnerait deux fois la même position après une suppression au milieu, et
     l'ordre d'affichage deviendrait celui du hasard. */
  const positions = await db
    .select({ position: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courseId));
  const suivante = positions.reduce((max, l) => Math.max(max, l.position), -1) + 1;

  await db.insert(courseLessons).values({
    courseId,
    title,
    content,
    videoUrl: videoUrl || null,
    durationMinutes,
    position: suivante,
  });
  refresh(formation.slug);
  return { success: true as const };
}

export async function deleteLesson(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await getDb().delete(courseLessons).where(eq(courseLessons.id, id));
  refresh();
}

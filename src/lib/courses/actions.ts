"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts, courseLessons, courses } from "@/lib/db/schema";
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

/**
 * Rattache un ARTICLE à une formation. Rien n'est rédigé ici : le contenu vit
 * dans l'éditeur d'articles, et la formation n'apporte que le regroupement et
 * l'ordre de lecture.
 */
export async function attachLesson(_prevState: unknown, formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return { error: "Accès réservé au superadmin." };

  const courseId = String(formData.get("courseId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!courseId || !postId) return { error: "Choisissez un article à rattacher." };

  const db = getDb();
  const [formation] = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!formation) return { error: "Formation introuvable." };

  const [article] = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(eq(blogPosts.id, postId))
    .limit(1);
  if (!article) return { error: "Article introuvable." };

  const dejaLa = await db
    .select({ id: courseLessons.id })
    .from(courseLessons)
    .where(and(eq(courseLessons.courseId, courseId), eq(courseLessons.postId, postId)))
    .limit(1);
  if (dejaLa.length > 0) return { error: "Cet article fait déjà partie de la formation." };

  /* La nouvelle leçon se range à la fin. Reprendre le NOMBRE de leçons
     donnerait deux fois la même position après une suppression au milieu, et
     l'ordre de lecture deviendrait celui du hasard. */
  const positions = await db
    .select({ position: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courseId));
  const suivante = positions.reduce((max, l) => Math.max(max, l.position), -1) + 1;

  await db.insert(courseLessons).values({ courseId, postId, position: suivante });
  refresh(formation.slug);
  return { success: true as const };
}

/** Déplace une leçon d'un rang, vers le haut ou vers le bas. */
export async function moveLesson(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "").trim();
  const sens = String(formData.get("direction") ?? "");
  if (!id || (sens !== "up" && sens !== "down")) return;

  const db = getDb();
  const [courante] = await db
    .select({ id: courseLessons.id, courseId: courseLessons.courseId, position: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.id, id))
    .limit(1);
  if (!courante) return;

  const fratrie = await db
    .select({ id: courseLessons.id, position: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courante.courseId))
    .orderBy(asc(courseLessons.position));
  const index = fratrie.findIndex((l) => l.id === id);
  const cible = fratrie[sens === "up" ? index - 1 : index + 1];
  if (!cible) return; // déjà en bout de liste

  /* On échange les positions des deux voisins. Réécrire toute la liste
     marcherait aussi, mais toucherait des lignes que personne n'a demandé
     à déplacer. */
  await db.update(courseLessons).set({ position: cible.position }).where(eq(courseLessons.id, courante.id));
  await db.update(courseLessons).set({ position: courante.position }).where(eq(courseLessons.id, cible.id));
  refresh();
}

/** Détache un article de la formation. L'ARTICLE lui-même n'est pas touché. */
export async function deleteLesson(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await getDb().delete(courseLessons).where(eq(courseLessons.id, id));
  refresh();
}

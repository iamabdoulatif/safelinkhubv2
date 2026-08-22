import { CoursePageContent } from "../../../formations/[slug]/page";

export default function CoursePageEn({ params }: { params: Promise<{ slug: string }> }) {
  return <CoursePageContent locale="en" params={params} />;
}

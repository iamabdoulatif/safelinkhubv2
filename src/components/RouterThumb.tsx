import Image from "next/image";
import { Router as RouterIcon } from "lucide-react";
import { deviceImage } from "@/lib/mikrotik/device-image";

/**
 * Vignette d'un routeur à côté de son nom : la photo de SON modèle quand on
 * la connaît (hAP ax², RB4011, L009…), sinon l'icône routeur. Décorative :
 * le nom et le modèle sont écrits à côté.
 */
export default function RouterThumb({
  model,
  size = 36,
  className = "",
}: {
  model: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const src = deviceImage(model);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-soft bg-clay ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" width={size - 6} height={size - 6} className="object-contain" />
      ) : (
        <RouterIcon className="text-ink-soft" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}

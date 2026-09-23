import type { ButtonHTMLAttributes } from "react";

/**
 * Bouton du SaaS. Les styles vivent dans globals.css (.btn, @layer components) :
 * `buttonClass()` sert aussi aux <Link> qui doivent ressembler à un bouton.
 *
 * Hiérarchie : primary (lime) = UNE action principale par zone ; secondary
 * (vert profond) = action forte non principale ; outline = action courante ;
 * ghost = action discrète ; destructive = suppression, jamais seule.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return `btn btn-${size} btn-${variant}${block ? " w-full" : ""}${className ? ` ${className}` : ""}`;
}

export default function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...props} />;
}

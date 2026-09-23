import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle } from "lucide-react";

/**
 * Champ de formulaire : libellé, contrôle, aide OU erreur — toujours dans cet
 * ordre, toujours reliés (htmlFor, aria-describedby, aria-invalid). Le style
 * du contrôle est la classe .field de globals.css.
 *
 *   <Field id="name" label="Nom du routeur" hint="Visible dans le portail">
 *     <Input name="name" />
 *   </Field>
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}) {
  const noteId = error || hint ? `${id}-note` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": noteId,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-err">
            *
          </span>
        )}
      </label>
      {control}
      {error ? (
        <p id={noteId} className="flex items-center gap-1.5 text-xs text-err">
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`field ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`field ${className}`} {...props} />;
}

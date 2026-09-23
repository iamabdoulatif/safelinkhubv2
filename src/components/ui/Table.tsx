import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Tableau de données. Remplace 25 recettes d'en-tête différentes : un seul
 * rythme (en-tête 12 px sur fond clay, cellules 14 px, lignes de 52 px),
 * nombres alignés à droite en chiffres tabulaires, survol discret.
 *
 *   <Table>
 *     <thead><tr><Th>Nom</Th><Th numeric>Montant</Th></tr></thead>
 *     <tbody><Tr><Td>…</Td><Td numeric>…</Td></Tr></tbody>
 *   </Table>
 */
export function Table({
  children,
  className = "",
  caption,
}: {
  children: ReactNode;
  className?: string;
  /** Titre lu par les lecteurs d'écran ; invisible à l'écran. */
  caption?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-line bg-paper ${className}`}>
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({
  numeric,
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-clay px-4 py-2.5 text-xs font-semibold text-ink-soft first:pl-5 last:pr-5 ${
        numeric ? "text-right" : ""
      } ${className}`}
      {...props}
    />
  );
}

export function Tr({ className = "", ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`border-b border-line-soft transition-colors last:border-0 hover:bg-clay/60 ${className}`}
      {...props}
    />
  );
}

export function Td({
  numeric,
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={`h-[52px] px-4 py-2 align-middle first:pl-5 last:pr-5 ${
        numeric ? "text-right tabular-nums" : ""
      } ${className}`}
      {...props}
    />
  );
}

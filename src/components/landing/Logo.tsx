// Brand name must never be machine-translated
export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      translate="no"
      className={`font-display text-lg font-extrabold tracking-tight sm:text-xl ${
        dark ? "text-paper" : "text-ink"
      }`}
    >
      Safe<span className="marker">LinkHub</span>
    </span>
  );
}

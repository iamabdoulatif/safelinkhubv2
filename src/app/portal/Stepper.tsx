// Fil d'Ariane du tunnel d'achat Wi-Fi : Forfait → Paiement → Code. Le client
// sait où il en est et ce qui reste, surtout quand l'app Wave l'a emmené
// ailleurs puis ramené ici.
import styles from "./PortalExperience.module.css";

const STEPS = ["Forfait", "Paiement", "Code Wi-Fi"] as const;

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className={styles.stepper} aria-label="Étapes">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const state = n < current ? styles.stepDone : n === current ? styles.stepActive : "";
        return (
          <li key={label} className={`${styles.step} ${state}`} aria-current={n === current ? "step" : undefined}>
            <span className={styles.stepDot} aria-hidden="true">
              {n < current ? "✓" : n}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

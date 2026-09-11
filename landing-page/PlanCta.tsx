import styles from "./landing.module.css";

/** Sem checkout configurado, não simula compra nem coleta dados pessoais. */
export function PlanCta({ name, destination }: { name: string; destination: string }) {
  if (destination) {
    return <a className={styles.primary} href={destination}>Contratar {name} ↗</a>;
  }
  return <details className={styles.planCta}>
    <summary className={styles.primary}>Contratar {name} <span aria-hidden>↗</span></summary>
    <p><strong>Checkout temporariamente indisponível.</strong> A publicação deste plano ainda precisa sincronizar com o provedor de pagamentos. Nenhuma cobrança foi realizada.</p>
  </details>;
}

import styles from "./landing.module.css";

/** Sem checkout configurado, não simula compra nem coleta dados pessoais. */
export function PlanCta({ name, destination }: { name: string; destination: string }) {
  if (destination !== "/#planos") {
    return <a className={styles.primary} href={destination}>Contratar {name} ↗</a>;
  }
  return <details className={styles.planCta}>
    <summary className={styles.primary}>Contratar {name} <span aria-hidden>↗</span></summary>
    <p><strong>Contratação online em preparação.</strong> Você escolheu o plano {name}. Os valores são demonstrativos; o pagamento e a ativação serão disponibilizados aqui. Nenhuma contratação ou cobrança foi realizada.</p>
  </details>;
}

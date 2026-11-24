export function PaymentsUnavailableNotice() {
  return (
    <section
      role="status"
      className="rounded-2xl border border-white/10 bg-white/5 p-5"
      data-testid="payments-unavailable"
    >
      <h2 className="t-card text-ink-hi">
        Pagamentos temporariamente indisponíveis
      </h2>
      <p className="t-body text-ink-mid mt-2">
        Os pagamentos e a cobrança de sinais estão desactivados. Pode continuar
        a fazer marcações e a pedir produtos; a barbearia confirma a
        disponibilidade dos artigos.
      </p>
    </section>
  );
}

/** Situação da assinatura de uma loja no Avant Cell. */
export const SITUACAO_ASSINATURA: Record<string, { rotulo: string; tom: "default" | "secondary" | "destructive" | "outline" }> = {
  trial:    { rotulo: "em teste",   tom: "secondary" },
  active:   { rotulo: "ativa",      tom: "default" },
  past_due: { rotulo: "em atraso",  tom: "destructive" },
  canceled: { rotulo: "cancelada",  tom: "outline" },
};

export const MODELOS_COMISSAO = [
  {
    valor: "recurring_percent",
    rotulo: "% recorrente da mensalidade",
    ajuda: "O representante recebe todo mês enquanto a loja pagar. É o que mais segura vendedor bom, e o que mais pesa no seu custo no longo prazo.",
  },
  {
    valor: "first_month_percent",
    rotulo: "% só da primeira mensalidade",
    ajuda: "Paga uma vez, quando a loja assina. Barato e simples, mas ninguém se preocupa em manter a loja ativa.",
  },
  {
    valor: "fixed_per_store",
    rotulo: "Valor fixo por loja ativada",
    ajuda: "Mesmo valor para qualquer plano. Fácil de explicar; não diferencia quem vende plano grande.",
  },
];

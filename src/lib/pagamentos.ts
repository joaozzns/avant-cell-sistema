/**
 * Nome de cada forma de pagamento, em um lugar só.
 *
 * Este mapa vivia copiado em seis telas, cada uma com as formas que o autor
 * lembrou na hora — e no fechamento de caixa apareciam "store_credit" e
 * "credit_plan" crus, porque aquela cópia não tinha as duas. Forma nova entra
 * aqui e passa a aparecer certa em todo lugar.
 */
export const FORMA_PAGAMENTO: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito à vista",
  credit_installments: "Crédito parcelado",
  credit_plan: "Crediário",
  store_credit: "Crédito na loja",
  wallet: "Carteira digital",
  transfer: "Transferência",
  voucher: "Vale / voucher",
};

/** Forma que ainda não está no mapa aparece legível, nunca como código cru. */
export function rotuloPagamento(forma: string | null | undefined) {
  if (!forma) return "—";
  return FORMA_PAGAMENTO[forma] ?? forma.replace(/_/g, " ");
}

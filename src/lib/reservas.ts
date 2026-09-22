/** Situações de uma reserva, na ordem em que acontecem. */
export const SITUACAO_RESERVA: Record<string, { rotulo: string; ajuda: string }> = {
  awaiting_purchase: { rotulo: "A comprar", ajuda: "Encomenda: o modelo não está no estoque e precisa ser comprado." },
  on_the_way: { rotulo: "A caminho", ajuda: "Pedido feito ao fornecedor, aguardando chegar." },
  available: { rotulo: "Separado", ajuda: "Está na loja, guardado no nome do cliente." },
  delivered: { rotulo: "Entregue", ajuda: "Cliente levou; a venda é fechada no PDV." },
  canceled: { rotulo: "Cancelada", ajuda: "Desistência antes do prazo." },
  expired: { rotulo: "Vencida", ajuda: "Passou do prazo de retirada e voltou para a venda." },
};

export const ABERTAS = ["awaiting_purchase", "on_the_way", "available"];

export function vencida(prazo: string | null, situacao: string) {
  if (!prazo || !ABERTAS.includes(situacao)) return false;
  return new Date(prazo + "T23:59:59") < new Date();
}

export function diasParaRetirada(prazo: string | null) {
  if (!prazo) return null;
  const alvo = new Date(prazo + "T23:59:59").getTime();
  return Math.ceil((alvo - Date.now()) / 86_400_000);
}

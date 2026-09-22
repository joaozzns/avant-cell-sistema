/** Etapas de um aparelho no laboratório externo, na ordem em que acontecem. */
export const ETAPAS_EXTERNO: { valor: string; rotulo: string; ajuda: string }[] = [
  { valor: "sent", rotulo: "Enviado", ajuda: "Saiu da loja e está a caminho do parceiro." },
  { valor: "in_analysis", rotulo: "Em análise", ajuda: "O parceiro recebeu e está avaliando." },
  { valor: "quoted", rotulo: "Orçado", ajuda: "O parceiro passou o preço; ainda não autorizamos." },
  { valor: "approved", rotulo: "Aprovado", ajuda: "Autorizamos o serviço — o custo entra na OS." },
  { valor: "in_repair", rotulo: "Em reparo", ajuda: "O parceiro está executando." },
  { valor: "returning", rotulo: "Voltando", ajuda: "Despachado de volta para a loja." },
  { valor: "received", rotulo: "Recebido", ajuda: "Aparelho de volta e conta lançada a pagar." },
];

export const ROTULO_EXTERNO: Record<string, string> = Object.fromEntries(
  ETAPAS_EXTERNO.map((e) => [e.valor, e.rotulo]),
);

export function diasCorridos(desde: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

/** Passou do prazo combinado e ainda não voltou: é o que precisa de telefonema. */
export function atrasado(prazo: string | null, situacao: string) {
  if (!prazo || situacao === "received") return false;
  return new Date(prazo + "T23:59:59") < new Date();
}

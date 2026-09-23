import { TERMO_GARANTIA_PADRAO, TERMO_SERVICO_PADRAO } from "@/lib/impressao";

/** Os textos que a loja imprime e o cliente assina. */
export const TIPOS_TERMO: {
  chave: string; titulo: string; onde: string; padrao: string;
}[] = [
  {
    chave: "service_term",
    titulo: "Termo de serviço (OS)",
    onde: "Impresso nas duas vias da ordem de serviço, acima da assinatura do cliente.",
    padrao: TERMO_SERVICO_PADRAO.join("\n"),
  },
  {
    chave: "warranty_term",
    titulo: "Termo de garantia",
    onde: "Sai na OS e no recibo de venda.",
    padrao: TERMO_GARANTIA_PADRAO,
  },
  {
    chave: "exchange_policy",
    titulo: "Política de troca",
    onde: "Sai no recibo de venda.",
    padrao:
      "Trocas e devoluções em até 7 dias corridos da compra, conforme o Código de Defesa do Consumidor, " +
      "com o produto sem uso, na embalagem original e acompanhado desta via. Produtos com defeito seguem " +
      "o prazo legal de garantia.",
  },
  {
    chave: "receipt_message",
    titulo: "Mensagem no rodapé do recibo",
    onde: "Última linha do cupom entregue ao cliente.",
    padrao: "Obrigado pela preferência! Guarde este comprovante para trocas e garantia.",
  },
];

/** Texto de exemplo do cadastro inicial não conta como termo escrito pela loja. */
export function ehTextoDeExemplo(corpo: string | null | undefined) {
  return !corpo?.trim() || /edite em configura/i.test(corpo);
}

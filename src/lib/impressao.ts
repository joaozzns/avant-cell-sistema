/**
 * Apoio às páginas de impressão (OS de entrada e recibo de venda).
 */

export const CHECKLIST_ITENS = [
  ["liga", "Liga"],
  ["tela_ok", "Tela sem trinca"],
  ["touch", "Touch funciona"],
  ["cameras", "Câmeras OK"],
  ["botoes", "Botões OK"],
  ["alto_falante", "Alto-falante OK"],
  ["microfone", "Microfone OK"],
  ["biometria", "Biometria OK"],
  ["carga", "Carrega"],
  ["sinal", "Sinal / chip OK"],
  ["sem_oxidacao", "Sem sinais de líquido/oxidação"],
  ["sem_abertura", "Sem marca de abertura anterior"],
] as const;

/* Textos usados enquanto a loja não cadastra os próprios termos.
   Os termos do banco que ainda estão com o texto de exemplo do cadastro
   inicial ("edite em Configurações") também caem aqui. */
export const TERMO_SERVICO_PADRAO = [
  "O cliente declara que as informações sobre o aparelho e o defeito relatado são verdadeiras e que o aparelho é de sua propriedade.",
  "O orçamento será informado antes de qualquer reparo, que só será executado após a aprovação do cliente.",
  "A loja não se responsabiliza por dados, fotos, contatos ou arquivos armazenados no aparelho. Recomendamos fazer backup antes da entrega.",
  "Aparelhos com sinais de líquido, oxidação ou abertura anterior podem apresentar outros defeitos durante ou após o reparo.",
  "Aparelhos não retirados em até 90 dias após o aviso de conclusão poderão ser considerados abandonados, conforme a legislação.",
  "A retirada só será feita mediante apresentação desta via ou de documento com foto do titular.",
];

export const TERMO_GARANTIA_PADRAO =
  "Garantia de 90 dias para o serviço executado e as peças substituídas, contada a partir da entrega, conforme o Código de Defesa do Consumidor (art. 26). A garantia não cobre queda, contato com líquido, mau uso, abertura por terceiros ou defeitos não relacionados ao serviço realizado.";

export function termoOuPadrao(corpo: string | null | undefined, padrao: string) {
  const texto = (corpo ?? "").trim();
  if (!texto || /edite em configura/i.test(texto)) return padrao;
  return texto;
}

type Endereco = Record<string, unknown> | string | null | undefined;

export function formatarEndereco(endereco: Endereco): string {
  if (!endereco) return "";
  if (typeof endereco === "string") return endereco;
  const e = endereco as Record<string, string | undefined>;
  const rua = [e.street ?? e.logradouro ?? e.rua, e.number ?? e.numero].filter(Boolean).join(", ");
  const cidade = [e.city ?? e.cidade, e.state ?? e.uf].filter(Boolean).join(" - ");
  return [rua, e.district ?? e.bairro, cidade, e.zip ?? e.cep].filter(Boolean).join(" · ");
}

export function formatarDocumento(doc: string | null | undefined) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}

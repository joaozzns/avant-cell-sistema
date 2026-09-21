/**
 * Avisos ao cliente.
 *
 * O que a loja manda no WhatsApp é sempre a mesma coisa: "abrimos sua OS",
 * "o orçamento está pronto", "seu aparelho está pronto para retirada". Digitar
 * isso na mão o dia inteiro custa tempo e sai diferente a cada atendente — e é
 * o que o cliente lembra depois.
 *
 * Aqui o texto vira modelo com variáveis. Quando a OS muda de situação, o
 * sistema escreve a mensagem pronta e deixa na fila; o atendente só confere e
 * envia (um clique abre o WhatsApp com o texto já digitado). Se a loja tiver
 * um serviço de WhatsApp contratado, o envio acontece sozinho.
 *
 * Nada é enviado sem ficar registrado: quem enviou, quando e o texto exato.
 */

export type Variavel = { chave: string; descricao: string; exemplo: string };

export const VARIAVEIS: Variavel[] = [
  { chave: "cliente", descricao: "Nome completo do cliente", exemplo: "Maria Aparecida Souza" },
  { chave: "primeiro_nome", descricao: "Só o primeiro nome", exemplo: "Maria" },
  { chave: "loja", descricao: "Nome da loja", exemplo: "Avant Cell Centro" },
  { chave: "numero_os", descricao: "Número da ordem de serviço", exemplo: "1042" },
  { chave: "aparelho", descricao: "Modelo do aparelho", exemplo: "iPhone 12 128GB" },
  { chave: "valor", descricao: "Valor do orçamento ou do saldo", exemplo: "R$ 480,00" },
  { chave: "prazo", descricao: "Prazo prometido na abertura", exemplo: "23/09/2026" },
  { chave: "garantia", descricao: "Data final da garantia do serviço", exemplo: "21/12/2026" },
  { chave: "link", descricao: "Link público de acompanhamento da OS", exemplo: "https://…/acompanhar/abc" },
];

export type ModeloPadrao = {
  key: string;
  name: string;
  body: string;
  auto_on_status: string | null;
  /** Mensagem de divulgação: só vai para quem autorizou contato (LGPD).
   *  Aviso sobre a própria OS do cliente não depende de autorização —
   *  faz parte do serviço que ele contratou. */
  marketing?: boolean;
};

export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    key: "os_opened",
    name: "OS aberta",
    auto_on_status: "open",
    body:
      "Olá {{primeiro_nome}}! Aqui é da {{loja}}.\n" +
      "Recebemos seu {{aparelho}} e abrimos a ordem de serviço nº {{numero_os}}.\n" +
      "Você acompanha tudo por aqui: {{link}}\n" +
      "Qualquer novidade a gente avisa por aqui mesmo.",
  },
  {
    key: "quote_ready",
    name: "Orçamento pronto",
    auto_on_status: "awaiting_approval",
    body:
      "Olá {{primeiro_nome}}! O orçamento do seu {{aparelho}} (OS {{numero_os}}) ficou pronto: {{valor}}.\n" +
      "Dá uma olhada no detalhamento em {{link}} e nos diga se podemos seguir com o reparo.",
  },
  {
    key: "approved",
    name: "Orçamento aprovado",
    auto_on_status: "approved",
    body:
      "Perfeito, {{primeiro_nome}}! Aprovação registrada na OS {{numero_os}}.\n" +
      "Já colocamos seu {{aparelho}} na fila da bancada e avisamos assim que estiver pronto.",
  },
  {
    key: "awaiting_part",
    name: "Aguardando peça",
    auto_on_status: "awaiting_part",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Sobre a OS {{numero_os}}: a peça do seu {{aparelho}} foi pedida e estamos aguardando a chegada.\n" +
      "Assim que ela chegar retomamos o reparo e te avisamos.",
  },
  {
    key: "ready",
    name: "Aparelho pronto",
    auto_on_status: "ready",
    body:
      "Boa notícia, {{primeiro_nome}}! Seu {{aparelho}} está pronto para retirada (OS {{numero_os}}).\n" +
      "Valor: {{valor}}. Estamos te esperando na {{loja}} — traga um documento com foto.",
  },
  {
    key: "unrepaired",
    name: "Sem reparo",
    auto_on_status: "unrepaired",
    body:
      "Oi {{primeiro_nome}}. Infelizmente não foi possível reparar seu {{aparelho}} (OS {{numero_os}}).\n" +
      "O laudo está em {{link}}. O aparelho está aqui à sua disposição para retirada.",
  },
  {
    key: "delivered",
    name: "Entregue (garantia)",
    auto_on_status: "delivered",
    body:
      "{{primeiro_nome}}, obrigado pela confiança! Seu {{aparelho}} foi entregue.\n" +
      "O serviço tem garantia até {{garantia}} — guarde esta mensagem.\n" +
      "Qualquer coisa, é só chamar aqui.",
  },
  {
    key: "pickup_reminder",
    name: "Lembrete de retirada",
    auto_on_status: null,
    body:
      "Oi {{primeiro_nome}}! Passando para lembrar que seu {{aparelho}} (OS {{numero_os}}) está pronto e aguardando retirada aqui na {{loja}}.\n" +
      "Consegue passar esta semana?",
  },
  {
    key: "billing",
    name: "Cobrança amigável",
    auto_on_status: null,
    body:
      "Olá {{primeiro_nome}}, tudo bem? Identificamos uma parcela em aberto de {{valor}} aqui na {{loja}}.\n" +
      "Se já pagou, desconsidere; se preferir, a gente combina uma forma de acerto por aqui mesmo.",
  },
  {
    key: "post_sale",
    name: "Pós-venda",
    auto_on_status: null,
    marketing: true,
    body:
      "Oi {{primeiro_nome}}! Faz um tempinho que você passou aqui na {{loja}}.\n" +
      "Está tudo certo com o aparelho? Se precisar de película, capinha ou uma revisão, é só chamar.",
  },
];

/** Troca {{variavel}} pelo valor. Variável conhecida sem valor sai do texto
 *  (mensagem com "R$ " solto parece erro); variável que o sistema não conhece
 *  fica como está, para o atendente ver que precisa preencher antes de enviar. */
export function preencher(corpo: string, valores: Record<string, string | null | undefined>) {
  return corpo
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (inteiro, chave: string) =>
      chave in valores ? (valores[chave] ?? "").toString() : inteiro)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

/** Telefone brasileiro no formato que o WhatsApp aceita: 55 + DDD + número. */
export function telefoneWhatsApp(bruto: string | null | undefined) {
  const so = (bruto ?? "").replace(/\D/g, "");
  if (so.length < 10) return null;
  if (so.startsWith("55") && so.length >= 12) return so;
  return "55" + so;
}

export function linkWhatsApp(telefone: string | null | undefined, texto: string) {
  const numero = telefoneWhatsApp(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export const SITUACAO_MENSAGEM: Record<string, string> = {
  queued: "na fila",
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "não enviada",
  received: "recebida",
};

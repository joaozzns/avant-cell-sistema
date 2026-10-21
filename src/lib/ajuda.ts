/* Central de ajuda.
 *
 * O texto mora aqui, no código, e não no banco. Dois motivos: cada artigo
 * aponta para telas que existem no código (se uma rota mudar de nome, o
 * artigo quebra junto e aparece na revisão), e o manual passa a ser revisado
 * no mesmo lugar onde a funcionalidade muda.
 *
 * Cada artigo declara em `telas` as rotas a que responde. É isso que faz o
 * botão "?" do topo abrir o artigo certo em vez da lista inteira: quem trava
 * no meio de uma venda não vai procurar índice.
 */

export type Bloco =
  | { tipo: "texto"; conteudo: string }
  | { tipo: "passos"; itens: string[] }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "aviso"; conteudo: string }
  | { tipo: "atalhos"; itens: { tecla: string; faz: string }[] };

export type Artigo = {
  slug: string;
  titulo: string;
  modulo: string;
  resumo: string;
  /** rotas que este artigo explica — a primeira é a principal */
  telas: string[];
  corpo: Bloco[];
};

export const MODULOS = [
  "Primeiros passos",
  "Venda e caixa",
  "Ordem de serviço",
  "Estoque",
  "Financeiro",
  "Conta e assinatura",
] as const;

export const ARTIGOS: Artigo[] = [
  // ------------------------------------------------ Primeiros passos
  {
    slug: "comecar",
    titulo: "Por onde começar",
    modulo: "Primeiros passos",
    resumo: "A ordem que evita retrabalho nos primeiros dias.",
    telas: ["/dashboard"],
    corpo: [
      { tipo: "texto", conteudo: "Não é preciso cadastrar tudo antes de vender. Dá para começar pelo caixa no mesmo dia e ir completando o resto conforme a loja usa. O que não dá é inverter a ordem abaixo: cada passo depende do anterior." },
      { tipo: "passos", itens: [
        "Formas de pagamento (Administração > Formas de pagamento). Sem elas o PDV não fecha venda.",
        "Produtos (Estoque > Catálogo). Comece pelos dez que mais vendem; o resto entra depois.",
        "Aparelhos com IMEI (Estoque > Aparelhos), se você vende celular. Cada aparelho é uma unidade com IMEI próprio.",
        "Equipe (Administração > Usuários e lojas). Convide por e-mail e escolha o papel de cada um.",
        "Termos de garantia e serviço (Administração > Termos), se você faz assistência. Eles saem impressos na OS.",
        "Fiscal (Fiscal > Configurações), quando for emitir nota.",
      ] },
      { tipo: "aviso", conteudo: "Já tem os dados em planilha? Importar dados lê planilha de produtos, clientes e aparelhos. É mais rápido do que digitar e evita erro de digitação em IMEI." },
    ],
  },
  {
    slug: "equipe-e-papeis",
    titulo: "Convidar a equipe e escolher o papel de cada um",
    modulo: "Primeiros passos",
    resumo: "Quem pode dar desconto, abrir caixa, ver o financeiro.",
    telas: ["/admin"],
    corpo: [
      { tipo: "texto", conteudo: "Cada pessoa entra com o próprio login. Não compartilhe senha: o sistema registra quem fez cada venda, cada desconto e cada sangria, e isso só funciona se cada um for ele mesmo." },
      { tipo: "passos", itens: [
        "Administração > Usuários e lojas > Convidar.",
        "Digite o e-mail, escolha a loja e o papel.",
        "A pessoa recebe um link, cria a senha dela e já entra.",
      ] },
      { tipo: "texto", conteudo: "Os papéis prontos:" },
      { tipo: "lista", itens: [
        "Proprietário / Admin — vê e faz tudo, inclusive financeiro e configurações.",
        "Gerente de loja — o dia a dia inteiro da loja, com alçada de desconto maior.",
        "Vendedor / Atendente — venda, caixa e cliente. Não vê custo nem financeiro.",
        "Técnico — ordem de serviço e bancada.",
        "Estoquista — entrada, inventário e transferência.",
        "Financeiro — contas a pagar e receber, conciliação.",
      ] },
      { tipo: "aviso", conteudo: "O papel do Proprietário não pode ser alterado nem removido, e ninguém consegue mudar o próprio papel. É proposital: impede que alguém se promova sozinho." },
    ],
  },
  {
    slug: "formas-de-pagamento",
    titulo: "Formas de pagamento e taxas de cartão",
    modulo: "Primeiros passos",
    resumo: "Por que o valor que cai na conta é menor que o da venda.",
    telas: ["/admin/formas-de-pagamento"],
    corpo: [
      { tipo: "texto", conteudo: "Cadastre aqui tudo o que a loja aceita: dinheiro, Pix, débito, crédito à vista, crédito parcelado e crediário. Para cartão, informe a taxa da operadora e em quantos dias o dinheiro cai." },
      { tipo: "texto", conteudo: "Com a taxa e o prazo preenchidos, o sistema já sabe que uma venda de R$ 1.000 no crédito não vira R$ 1.000 na conta, e o fluxo de caixa mostra o valor e a data certos. Sem isso, o Financeiro mostra dinheiro que você não tem." },
      { tipo: "aviso", conteudo: "Depois, use Financeiro > Conciliação de cartão para casar o que a operadora depositou com o que o sistema esperava. É assim que se descobre taxa cobrada a mais." },
    ],
  },

  {
    slug: "clientes",
    titulo: "Cadastro de clientes e avisos",
    modulo: "Primeiros passos",
    resumo: "O cadastro que vira garantia, crediário e recompra.",
    telas: ["/clientes", "/clientes/avisos"],
    corpo: [
      { tipo: "texto", conteudo: "Dá para vender sem cliente, mas aí a venda não tem dono: não há garantia vinculada, nem crediário, nem histórico quando ele voltar. Nome e WhatsApp já bastam; o resto entra depois." },
      { tipo: "texto", conteudo: "Com o cliente cadastrado, o sistema passa a saber o que ele comprou, quanto deve e quando faz aniversário. Clientes > Avisos ao cliente reúne quem está com conta vencendo, quem tem aparelho pronto para retirar e quem faz aniversário no dia." },
      { tipo: "aviso", conteudo: "Pediram para apagar os dados (LGPD)? Use Clientes > Pedidos LGPD. Ele anonimiza o cadastro sem apagar a venda — a nota fiscal e a contabilidade continuam de pé, que é o que a lei exige." },
    ],
  },
  {
    slug: "fiscal",
    titulo: "Emitir nota fiscal",
    modulo: "Primeiros passos",
    resumo: "O que precisa estar configurado antes da primeira NF-e.",
    telas: ["/fiscal", "/fiscal/configuracoes"],
    corpo: [
      { tipo: "texto", conteudo: "Antes da primeira nota, preencha Fiscal > Configurações: certificado digital, regime tributário, série e numeração, e as operações fiscais que a loja usa (venda, troca, remessa)." },
      { tipo: "passos", itens: [
        "Configure o fiscal uma vez.",
        "Na venda, escolha emitir a nota.",
        "Acompanhe em Fiscal > Monitor de notas: autorizada, rejeitada ou pendente.",
      ] },
      { tipo: "aviso", conteudo: "Nota rejeitada quase sempre é cadastro: NCM, CFOP ou CPF/CNPJ do cliente. O monitor mostra o motivo que a Sefaz devolveu — leia antes de tentar de novo, porque reenviar igual rejeita igual." },
      { tipo: "texto", conteudo: "O módulo fiscal está disponível a partir do plano Profissional." },
    ],
  },
  // ------------------------------------------------ Venda e caixa
  {
    slug: "fazer-uma-venda",
    titulo: "Fazer uma venda no PDV",
    modulo: "Venda e caixa",
    resumo: "Do produto ao comprovante, com teclado.",
    telas: ["/pdv", "/pdv/vendas"],
    corpo: [
      { tipo: "aviso", conteudo: "O caixa precisa estar aberto. Se o PDV recusar a venda, é quase sempre isso: vá em Vendas > Caixa e faça a abertura do turno." },
      { tipo: "passos", itens: [
        "Busque o produto por nome, código, EAN ou IMEI. O leitor de código de barras funciona direto no campo de busca.",
        "Repita para os outros itens. Para alterar quantidade ou preço, clique no item na lista.",
        "Vincule o cliente, se houver. É o que permite garantia, crediário e histórico depois.",
        "Lance o desconto, se for o caso.",
        "Escolha a forma de pagamento e confirme.",
      ] },
      { tipo: "atalhos", itens: [
        { tecla: "F2", faz: "ir para a busca de produto" },
        { tecla: "F4", faz: "vincular cliente" },
        { tecla: "F8", faz: "ir para o pagamento" },
      ] },
      { tipo: "texto", conteudo: "Dá para dividir o pagamento: lance o valor em dinheiro, confirme, e o que faltar fica para a segunda forma. Troco só é aceito em dinheiro, e nunca maior que o valor entregue." },
      { tipo: "aviso", conteudo: "Aparelho com IMEI sai do estoque como unidade: ao escolher o modelo, o sistema pede qual aparelho está saindo. Isso é o que liga a garantia àquele IMEI." },
    ],
  },
  {
    slug: "abrir-e-fechar-caixa",
    titulo: "Abrir e fechar o caixa",
    modulo: "Venda e caixa",
    resumo: "Fundo de troco, sangria, suprimento e conferência do turno.",
    telas: ["/pdv/caixa"],
    corpo: [
      { tipo: "passos", itens: [
        "Na abertura, informe o fundo de troco — o dinheiro que já está na gaveta.",
        "Durante o turno, registre sangria (tirou dinheiro) e suprimento (colocou dinheiro).",
        "No fechamento, conte a gaveta e digite o valor contado.",
      ] },
      { tipo: "texto", conteudo: "O sistema compara o que você contou com o que ele esperava e mostra a diferença. Sobra e falta ficam registradas com o nome de quem fechou — não é para punir ninguém, é para a diferença aparecer no mesmo dia em vez de no fim do mês." },
      { tipo: "aviso", conteudo: "A sangria é recusada se for maior do que tem na gaveta, ou se a pessoa não tiver essa permissão. Gerente e proprietário têm; vendedor, por padrão, não." },
    ],
  },
  {
    slug: "desconto",
    titulo: "Desconto e alçada",
    modulo: "Venda e caixa",
    resumo: "Por que o sistema recusou o desconto que você lançou.",
    telas: ["/pdv"],
    corpo: [
      { tipo: "texto", conteudo: "Cada papel tem um limite de desconto. Quando o PDV recusa, é porque o valor passou da alçada de quem está logado — não é erro." },
      { tipo: "lista", itens: [
        "Peça para o gerente lançar a venda, ou",
        "Aumente o limite daquele papel em Administração > Usuários e lojas.",
      ] },
      { tipo: "aviso", conteudo: "Existe também o preço mínimo por produto, cadastrado no catálogo. Ele vale para todo mundo, inclusive o proprietário: é a trava que impede vender abaixo do custo por engano." },
    ],
  },
  {
    slug: "devolucao",
    titulo: "Devolver ou cancelar uma venda",
    modulo: "Venda e caixa",
    resumo: "O que volta para o estoque e o que acontece com a comissão.",
    telas: ["/pdv/vendas"],
    corpo: [
      { tipo: "passos", itens: [
        "Vendas > Vendas realizadas, abra a venda.",
        "Clique em Devolver e marque os itens que voltaram.",
        "Confirme.",
      ] },
      { tipo: "texto", conteudo: "O item devolvido volta ao estoque, o valor sai do faturamento do dia e a comissão do vendedor é estornada na mesma proporção. Aparelho com IMEI volta como a mesma unidade, disponível para venda outra vez." },
      { tipo: "aviso", conteudo: "Devolução parcial é normal: marque só os itens que voltaram. A venda continua existindo com o que o cliente ficou." },
    ],
  },
  {
    slug: "reservas",
    titulo: "Reservas e encomendas",
    modulo: "Venda e caixa",
    resumo: "Guardar um aparelho para um cliente sem vender ainda.",
    telas: ["/pdv/reservas"],
    corpo: [
      { tipo: "texto", conteudo: "A reserva separa a peça para aquele cliente. Enquanto durar, o aparelho continua no estoque mas sai da contagem disponível: ninguém vende sem querer o que já está prometido." },
      { tipo: "aviso", conteudo: "Em modelo com IMEI, escolha qual aparelho fica guardado. Reservar só o modelo não segura nada — outro vendedor leva a unidade que você prometeu." },
    ],
  },

  // ------------------------------------------------ Ordem de serviço
  {
    slug: "abrir-os",
    titulo: "Abrir uma ordem de serviço",
    modulo: "Ordem de serviço",
    resumo: "O check-in que evita discussão na entrega.",
    telas: ["/os/nova", "/os"],
    corpo: [
      { tipo: "texto", conteudo: "A OS tem seis partes, e a mais importante é a quarta." },
      { tipo: "passos", itens: [
        "Cliente — busque ou cadastre na hora.",
        "Aparelho — marca, modelo e IMEI. O IMEI é validado: 15 dígitos com dígito verificador certo.",
        "Defeito relatado — nas palavras do cliente, não nas suas.",
        "Estado de entrada (checklist) — marque risco, trinco, mancha na tela, o que já estava lá.",
        "Acessórios e acesso — capa, chip, cartão, e a senha de desbloqueio.",
        "Prioridade e valores — prazo, valor prévio e taxa de diagnóstico.",
      ] },
      { tipo: "aviso", conteudo: "O checklist de entrada é o que resolve a discussão de \"esse risco não estava aqui\". Dois minutos na abertura economizam uma hora na entrega." },
      { tipo: "texto", conteudo: "Ao salvar, a OS ganha um link público. Mande no WhatsApp: o cliente acompanha o andamento sozinho e para de ligar perguntando." },
    ],
  },
  {
    slug: "andamento-os",
    titulo: "Diagnóstico, orçamento e peça",
    modulo: "Ordem de serviço",
    resumo: "O caminho da OS, da bancada até ficar pronta.",
    telas: ["/os"],
    corpo: [
      { tipo: "texto", conteudo: "A OS anda em etapas, e o sistema não deixa pular: recebida, em diagnóstico, aguardando aprovação, aprovada, em reparo, pronta, entregue." },
      { tipo: "passos", itens: [
        "Diagnóstico — defeito constatado, causa provável e procedimento indicado. Vira laudo.",
        "Orçamento — lance os itens. O cliente aprova pelo link público ou no balcão.",
        "Peça — requisite do estoque. A peça sai do estoque na hora em que é aplicada, não antes.",
        "Pronta — avise o cliente.",
      ] },
      { tipo: "aviso", conteudo: "Se a peça não tiver saldo, o sistema recusa a aplicação. Não é travamento: é o estoque se recusando a ficar negativo. Dê entrada na peça primeiro." },
      { tipo: "texto", conteudo: "Quando o conserto vai para fora, use Laboratório externo: a OS fica marcada como fora da loja, com prazo próprio, e não some do painel." },
    ],
  },
  {
    slug: "entregar-os",
    titulo: "Entregar a OS e cobrar",
    modulo: "Ordem de serviço",
    resumo: "Pagamento, quem retirou e início da garantia.",
    telas: ["/os"],
    corpo: [
      { tipo: "passos", itens: [
        "Abra a OS pronta e clique em Entregar.",
        "Lance o pagamento, como numa venda.",
        "Registre quem retirou — titular ou terceiro autorizado.",
      ] },
      { tipo: "texto", conteudo: "Na entrega, a garantia começa a contar e o serviço entra no faturamento do dia. O termo de garantia sai impresso com a versão que estava valendo naquele dia, não a de hoje — se você mudar o texto depois, a OS antiga continua com o termo que o cliente assinou." },
      { tipo: "aviso", conteudo: "Registrar quem retirou parece burocracia até o dia em que o titular diz que não foi ele quem pegou o aparelho." },
    ],
  },

  // ------------------------------------------------ Estoque
  {
    slug: "cadastrar-produto",
    titulo: "Cadastrar produto e aparelho com IMEI",
    modulo: "Estoque",
    resumo: "A diferença entre produto de prateleira e unidade rastreada.",
    telas: ["/estoque", "/estoque/aparelhos"],
    corpo: [
      { tipo: "texto", conteudo: "São duas coisas diferentes, e confundir as duas é a causa mais comum de estoque errado." },
      { tipo: "lista", itens: [
        "Produto comum (capa, película, fone) — o estoque é um número. Dez capas iguais são dez de um item só.",
        "Aparelho com IMEI — cada unidade é única e rastreável. Dois iPhone 13 iguais são duas unidades com IMEI diferente, custo diferente e garantia própria.",
      ] },
      { tipo: "texto", conteudo: "Para aparelho, marque \"Controlar por IMEI\" no cadastro do produto. Depois, cada unidade entra por Estoque > Aparelhos, com IMEI, custo e preço." },
      { tipo: "aviso", conteudo: "O IMEI é conferido no cadastro (15 dígitos, dígito verificador). Se o sistema recusou, confira a digitação antes de insistir — é quase sempre um número trocado." },
    ],
  },
  {
    slug: "inventario",
    titulo: "Inventário e ajuste de estoque",
    modulo: "Estoque",
    resumo: "Acertar o sistema com a prateleira sem perder o histórico.",
    telas: ["/estoque/inventario", "/estoque/movimentacoes"],
    corpo: [
      { tipo: "texto", conteudo: "Não corrija estoque editando o produto. Use o inventário: ele registra o que foi contado, por quem, e gera o ajuste com motivo. Daqui a seis meses, quando a conta não bater, esse histórico é a única forma de descobrir onde começou." },
      { tipo: "passos", itens: [
        "Estoque > Inventário > Novo.",
        "Conte e digite a quantidade encontrada de cada item.",
        "Feche. O sistema gera o ajuste da diferença.",
      ] },
      { tipo: "aviso", conteudo: "O sistema recusa quantidade negativa e item de outra loja. Se recusou, é isso." },
    ],
  },
  {
    slug: "transferencia",
    titulo: "Transferir entre lojas",
    modulo: "Estoque",
    resumo: "Sai de uma, entra na outra, com confirmação no destino.",
    telas: ["/estoque/transferencias"],
    corpo: [
      { tipo: "passos", itens: [
        "Estoque > Transferências > Nova.",
        "Escolha a loja de destino e os itens.",
        "Envie. A mercadoria sai do estoque de origem e fica em trânsito.",
        "Na loja de destino, confirme o recebimento.",
      ] },
      { tipo: "aviso", conteudo: "Enquanto ninguém confirmar o recebimento, o item fica em trânsito e não aparece disponível em nenhuma das duas. É proposital: mercadoria em trânsito não está na prateleira de ninguém." },
      { tipo: "texto", conteudo: "O que está reservado para um cliente não pode ser transferido, e não dá para transferir para a própria loja de origem." },
    ],
  },
  {
    slug: "compras",
    titulo: "Pedido de compra e entrada de mercadoria",
    modulo: "Estoque",
    resumo: "Do pedido ao fornecedor até o estoque subir.",
    telas: ["/compras", "/compras/fornecedores"],
    corpo: [
      { tipo: "passos", itens: [
        "Cadastre o fornecedor em Compras > Fornecedores.",
        "Compras > Novo pedido, lance os itens e as quantidades.",
        "Quando a mercadoria chegar, abra o pedido e registre o recebimento.",
      ] },
      { tipo: "texto", conteudo: "O estoque só sobe no recebimento, não no pedido. Pedido feito é intenção; mercadoria na prateleira é estoque." },
      { tipo: "aviso", conteudo: "Receber mais do que foi pedido é recusado. Chegou a mais? Ajuste o pedido antes de receber, para a nota e o estoque continuarem batendo." },
    ],
  },

  // ------------------------------------------------ Financeiro
  {
    slug: "contas",
    titulo: "Contas a pagar e a receber",
    modulo: "Financeiro",
    resumo: "Baixa, juros, desconto e o que entra sozinho.",
    telas: ["/financeiro/pagar", "/financeiro/receber"],
    corpo: [
      { tipo: "texto", conteudo: "Venda no crediário e no cartão parcelado já entram sozinhas em contas a receber, com as datas certas. Você não precisa lançar nada: só dar baixa quando o dinheiro entrar." },
      { tipo: "passos", itens: [
        "Abra a conta e clique em Baixar.",
        "Informe o valor recebido, e juros ou desconto se houver.",
        "Escolha a conta bancária que recebeu.",
      ] },
      { tipo: "aviso", conteudo: "Baixa parcial é aceita: lance o que entrou e a conta continua aberta pelo resto. Desconto na baixa também tem alçada — é o mesmo limite do desconto em venda." },
    ],
  },
  {
    slug: "conciliacao",
    titulo: "Conciliação de cartão",
    modulo: "Financeiro",
    resumo: "Conferir o que a operadora depositou.",
    telas: ["/financeiro/conciliacao"],
    corpo: [
      { tipo: "texto", conteudo: "A tela mostra, lado a lado, o que o sistema esperava receber de cada venda no cartão e o que a operadora efetivamente depositou. A diferença aparece destacada." },
      { tipo: "lista", itens: [
        "Diferença pequena e constante — a taxa cadastrada está desatualizada. Corrija em Formas de pagamento.",
        "Depósito que não chegou — cobre a operadora, com a data da venda em mãos.",
        "Valor a mais — antecipação ou estorno; confira o extrato.",
      ] },
    ],
  },
  {
    slug: "comissao",
    titulo: "Comissão e metas",
    modulo: "Financeiro",
    resumo: "Como o sistema calcula o que cada vendedor ganhou.",
    telas: ["/financeiro/comissoes", "/admin/vendedores"],
    corpo: [
      { tipo: "texto", conteudo: "A comissão é calculada sobre as vendas concluídas do período, pela regra cadastrada para cada papel ou pessoa. Devolução estorna a parte devolvida automaticamente — o vendedor não fica comissionado por venda que voltou." },
      { tipo: "aviso", conteudo: "Cada vendedor tem um link pessoal onde acompanha as próprias vendas, comissão e meta, sem precisar de login no sistema. Está em Administração > Vendedores." },
    ],
  },
  {
    slug: "relatorios",
    titulo: "Relatórios e DRE",
    modulo: "Financeiro",
    resumo: "Onde ver se o mês fechou no azul.",
    telas: ["/relatorios", "/financeiro/dre"],
    corpo: [
      { tipo: "lista", itens: [
        "Relatórios > Vendas — faturamento, ticket médio, o que mais saiu, por vendedor.",
        "Relatórios > Assistência — OS por estado, prazo médio, reincidência.",
        "Relatórios > Estoque — parado, girando, abaixo do mínimo.",
        "Financeiro > DRE — entradas menos saídas, com margem.",
      ] },
      { tipo: "aviso", conteudo: "O DRE só fica confiável se o custo dos produtos estiver preenchido. Preço de venda sem custo mostra faturamento, não lucro." },
    ],
  },

  // ------------------------------------------------ Conta
  {
    slug: "assinatura",
    titulo: "Assinatura, cobrança e bloqueio",
    modulo: "Conta e assinatura",
    resumo: "O que acontece se o pagamento falhar.",
    telas: ["/assinatura"],
    corpo: [
      { tipo: "texto", conteudo: "A tela Assinatura mostra o plano, o valor e a data da próxima cobrança." },
      { tipo: "lista", itens: [
        "Período de avaliação — tudo liberado até a data de término.",
        "Pagamento pendente — o sistema continua liberado durante a carência, para o cartão ser tentado de novo.",
        "Vencida — consulta e impressão continuam; lançar venda, OS e caixa fica bloqueado até regularizar.",
      ] },
      { tipo: "aviso", conteudo: "Bloqueio nunca apaga nada. Os dados continuam no lugar e voltam a aceitar lançamento assim que o pagamento entrar." },
    ],
  },
  {
    slug: "atalhos-do-painel",
    titulo: "Deixar a tela inicial do seu jeito",
    modulo: "Conta e assinatura",
    resumo: "Cada pessoa escolhe os próprios atalhos.",
    telas: ["/atalhos", "/dashboard"],
    corpo: [
      { tipo: "texto", conteudo: "Os atalhos da tela inicial são por pessoa, não por loja. Quem fica no balcão quer venda e caixa à mão; quem cuida do financeiro quer contas a pagar. Cada um arruma a sua." },
      { tipo: "passos", itens: [
        "Na tela inicial, clique em Configurar no quadro Atalhos.",
        "Escolha entre os 25 disponíveis e ordene com as setas.",
        "Salve.",
      ] },
      { tipo: "texto", conteudo: "Os avisos do dia — aniversariante, conta vencendo, OS com prazo estourado — aparecem sempre, independente da sua escolha." },
    ],
  },
];

/** Tira acento e caixa: quem busca com pressa digita "comissao" e "orcamento". */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca simples por título, resumo e corpo. */
export function procurar(termo: string): Artigo[] {
  const t = normalizar(termo.trim());
  if (!t) return ARTIGOS;
  const texto = (a: Artigo) =>
    (a.titulo + " " + a.resumo + " " + a.modulo + " " +
      a.corpo.map((b) =>
        b.tipo === "texto" || b.tipo === "aviso" ? b.conteudo
        : b.tipo === "atalhos" ? b.itens.map((i) => i.tecla + " " + i.faz).join(" ")
        : b.itens.join(" ")).join(" ")
    );
  return ARTIGOS.filter((a) => normalizar(texto(a)).includes(t));
}

export const porSlug = (slug: string) => ARTIGOS.find((a) => a.slug === slug);

/** O artigo que responde pela tela atual — é o que o botão "?" do topo abre. */
export function artigoDaTela(caminho: string): Artigo | undefined {
  const candidatos = ARTIGOS.filter((a) =>
    a.telas.some((t) => caminho === t || caminho.startsWith(t + "/")));
  if (!candidatos.length) return undefined;
  /* a rota mais específica ganha: /pdv/caixa vence /pdv */
  return candidatos.sort((a, b) => {
    const ca = Math.max(...a.telas.filter((t) => caminho.startsWith(t)).map((t) => t.length));
    const cb = Math.max(...b.telas.filter((t) => caminho.startsWith(t)).map((t) => t.length));
    return cb - ca;
  })[0];
}

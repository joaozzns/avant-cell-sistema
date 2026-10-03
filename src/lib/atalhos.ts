/* Catálogo dos atalhos do painel.
 *
 * O botão "Configurar" dos Atalhos levava para /admin e não configurava
 * atalho nenhum: os doze eram fixos no código. Uma loja que nunca compra de
 * fornecedor via "Compras" todo dia; uma que não emite nota via "Fiscal"
 * ocupando lugar. Agora cada pessoa escolhe os seus.
 *
 * A lista mora aqui, e não no banco, porque cada atalho aponta para uma tela
 * que existe no código: catálogo em tabela viraria link quebrado no dia em que
 * uma rota mudasse de nome. O que vai para o banco é só a escolha de cada um —
 * uma lista de identificadores.
 */

export type Atalho = {
  id: string;
  rotulo: string;
  href: string;
  icone: string;      // nome do ícone no lucide-react
  grupo: string;
};

export const CATALOGO: Atalho[] = [
  { id: "venda",         rotulo: "Nova venda",           href: "/pdv",                      icone: "ShoppingCart",      grupo: "Vender" },
  { id: "vendas",        rotulo: "Vendas do PDV",        href: "/pdv/vendas",               icone: "ShoppingCart",      grupo: "Vender" },
  { id: "caixa",         rotulo: "Abrir / fechar caixa", href: "/pdv/caixa",                icone: "CircleDollarSign",  grupo: "Vender" },
  { id: "reservas",      rotulo: "Reservas",             href: "/pdv/reservas",             icone: "CalendarClock",     grupo: "Vender" },

  { id: "os_nova",       rotulo: "Abrir OS",             href: "/os/nova",                  icone: "Wrench",            grupo: "Assistência" },
  { id: "os",            rotulo: "Ordens de serviço",    href: "/os",                       icone: "Wrench",            grupo: "Assistência" },
  { id: "laboratorio",   rotulo: "Laboratório externo",  href: "/os/laboratorio",           icone: "Wrench",            grupo: "Assistência" },

  { id: "clientes",      rotulo: "Clientes",             href: "/clientes",                 icone: "Users",             grupo: "Clientes" },
  { id: "cliente_novo",  rotulo: "Cadastrar cliente",    href: "/clientes/novo",            icone: "Users",             grupo: "Clientes" },
  { id: "avisos",        rotulo: "Avisos ao cliente",    href: "/clientes/avisos",          icone: "BellRing",          grupo: "Clientes" },

  { id: "estoque",       rotulo: "Estoque",              href: "/estoque",                  icone: "Package",           grupo: "Estoque" },
  { id: "aparelhos",     rotulo: "Aparelhos",           href: "/estoque/aparelhos",        icone: "Boxes",             grupo: "Estoque" },
  { id: "inventario",    rotulo: "Inventário",           href: "/estoque/inventario",       icone: "Boxes",             grupo: "Estoque" },
  { id: "movimentacoes", rotulo: "Movimentações",        href: "/estoque/movimentacoes",    icone: "Boxes",             grupo: "Estoque" },
  { id: "usado",         rotulo: "Compra de usado",      href: "/estoque/usado",            icone: "Boxes",             grupo: "Estoque" },

  { id: "compras",       rotulo: "Compras",              href: "/compras",                  icone: "Package",           grupo: "Compras" },
  { id: "fornecedores",  rotulo: "Fornecedores",         href: "/compras/fornecedores",     icone: "Package",           grupo: "Compras" },

  { id: "financeiro",    rotulo: "Financeiro",           href: "/financeiro",               icone: "Wallet",            grupo: "Dinheiro" },
  { id: "receber",       rotulo: "Contas a receber",     href: "/financeiro/receber",       icone: "Wallet",            grupo: "Dinheiro" },
  { id: "pagar",         rotulo: "Contas a pagar",       href: "/financeiro/pagar",         icone: "Wallet",            grupo: "Dinheiro" },
  { id: "comissoes",     rotulo: "Comissões",            href: "/financeiro/comissoes",     icone: "Wallet",            grupo: "Dinheiro" },
  { id: "conciliacao",   rotulo: "Conciliação de cartão",href: "/financeiro/conciliacao",   icone: "Wallet",            grupo: "Dinheiro" },

  { id: "fiscal",        rotulo: "Fiscal",               href: "/fiscal",                   icone: "FileText",          grupo: "Outros" },
  { id: "relatorios",    rotulo: "Relatórios",           href: "/relatorios",               icone: "FileText",          grupo: "Outros" },
  { id: "alertas",       rotulo: "Central de alertas",   href: "/alertas",                  icone: "BellRing",          grupo: "Outros" },
];

/** O que aparece para quem nunca configurou: o dia a dia de uma loja. */
export const PADRAO = [
  "venda", "clientes", "estoque", "os_nova", "caixa",
  "aparelhos", "compras", "financeiro", "fiscal", "vendas",
];

export const porId = (id: string) => CATALOGO.find((a) => a.id === id);

/** Mantém a ordem escolhida e descarta id que não existe mais no catálogo. */
export function resolver(escolhidos: string[] | null | undefined): Atalho[] {
  const lista = escolhidos?.length ? escolhidos : PADRAO;
  return lista.map(porId).filter((a): a is Atalho => Boolean(a));
}

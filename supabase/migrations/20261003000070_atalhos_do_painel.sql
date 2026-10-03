-- Cada pessoa escolhe os próprios atalhos
--
-- O botão "Configurar" dos Atalhos levava para /admin e não configurava atalho
-- nenhum: os doze eram fixos no código. Uma loja que nunca compra de
-- fornecedor via "Compras" todo dia; uma que não emite nota via "Fiscal"
-- ocupando lugar na tela que mais se olha.
--
-- A escolha é por pessoa, não por loja: quem fica no balcão quer venda e
-- caixa à mão; quem cuida do financeiro quer contas a pagar e conciliação. São
-- duas telas iniciais diferentes para a mesma loja.
--
-- Guarda só os identificadores. O catálogo mora no código, porque cada atalho
-- aponta para uma tela que existe lá — catálogo em tabela viraria link
-- quebrado no dia em que uma rota mudasse de nome.

create table if not exists public.user_shortcuts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  items      text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_shortcuts enable row level security;

drop policy if exists atalhos_proprios on public.user_shortcuts;
create policy atalhos_proprios on public.user_shortcuts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.user_shortcuts is
  'Atalhos escolhidos por cada usuário no painel. Lista vazia ou linha '
  'ausente significa "ainda não escolheu": o painel mostra o conjunto padrão.';

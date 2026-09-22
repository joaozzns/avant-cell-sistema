-- Dinheiro que entra no caixa sem ser venda.
--
-- Parcela de crediário paga em espécie e sinal de reserva em dinheiro entram
-- como 'receivable_payment' — mas o esperado do fechamento só somava venda,
-- suprimento, sangria e estorno. Resultado: a gaveta fechava com sobra do
-- tamanho exato do que o cliente pagou, e o operador levava a culpa por uma
-- diferença que não existia.
--
-- Só existe movimento de caixa quando o recebimento é em espécie (recebimento
-- em conta vira lançamento bancário), então somar aqui é somar dinheiro real.

create or replace function public.cash_expected(p_session uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with s as (
    select * from public.cash_sessions where id = p_session
  ),
  pays as (
    select sp.kind::text as kind,
           sum(sp.amount - coalesce(sp.change_given, 0)) as total
    from public.sales sa
    join public.sale_payments sp on sp.sale_id = sa.id
    where sa.cash_session_id = p_session
      and sa.status in ('completed', 'partially_returned', 'returned')
    group by sp.kind
  ),
  moves as (
    select coalesce(sum(case when type = 'supply'             then amount
                             when type = 'receivable_payment' then amount
                             when type = 'withdrawal'         then -amount
                             when type = 'refund'             then -amount
                             else 0 end), 0) as net_cash
    from public.cash_movements where session_id = p_session
  )
  select jsonb_build_object(
    'cash', coalesce((select total from pays where kind = 'cash'), 0)
            + (select opening_amount from s)
            + (select net_cash from moves),
    'others', coalesce((select jsonb_object_agg(kind, total) from pays where kind <> 'cash'), '{}'::jsonb)
  )
$$;

grant execute on function public.cash_expected(uuid) to authenticated;

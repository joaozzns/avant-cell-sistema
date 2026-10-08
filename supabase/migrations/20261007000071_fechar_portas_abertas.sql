-- Fecha portas que estavam abertas sem precisar
--
-- A varredura de hoje encontrou duas coisas. Nenhuma das duas vazou dado:
-- o RLS segurou tudo. São as duas camadas de fora que estavam frouxas.
--
-- 1. Oito funções de operação de loja podiam ser CHAMADAS por quem nem está
--    logado (papel anon). Elas são SECURITY INVOKER, então o RLS as fazia
--    falhar -- "Conta a receber não encontrada", igualzinho para id real e id
--    inventado, sem oráculo. Mas falhar depois de rodar ainda é rodar: um
--    desconhecido conseguia disparar consulta no banco à vontade, de graça,
--    em um projeto que paga por uso. Entregar OS, receber pedido de compra e
--    baixar conta são coisas de gente logada; o anon não tem o que fazer ali.
--
-- 2. next_store_number recebia a loja por parâmetro e não conferia se ela é
--    da empresa de quem chamou. Quem estivesse logado em qualquer loja podia
--    passar o uuid da loja de outra empresa e queimar o número seguinte dela
--    -- a venda seguinte daquela loja pularia um número. Não lê nada e não
--    escreve dado de ninguém, mas atravessa a fronteira entre empresas, que é
--    justamente a linha que o resto do sistema inteiro defende.

-- ---------- 1. o anon sai das funções de operação ----------
revoke execute on function public.cash_expected(uuid)                                   from anon;
revoke execute on function public.deliver_os(jsonb)                                     from anon;
revoke execute on function public.os_apply_part(uuid)                                   from anon;
revoke execute on function public.os_request_part(uuid, uuid, numeric, numeric)         from anon;
revoke execute on function public.os_return_part(uuid)                                  from anon;
revoke execute on function public.po_receive(jsonb)                                     from anon;
revoke execute on function public.settle_payable(uuid, numeric, uuid)                   from anon;
revoke execute on function public.settle_receivable(uuid, numeric, numeric, numeric, uuid) from anon;

-- As cinco que continuam abertas ao anon são abertas de propósito, e o token
-- (uuid v4, sorteado) é a credencial: invite_preview, partner_panel,
-- public_os_get, public_os_decide e seller_panel. Sem elas o cliente não
-- acompanha a OS pelo link, o representante não vê a carteira e ninguém
-- aceita convite antes de ter conta.

-- ---------- 2. o número da loja só anda dentro da própria empresa ----------
create or replace function public.next_store_number(p_store uuid, p_kind text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.stores s
     where s.id = p_store and s.company_id = app.current_company_id()
  ) then
    raise exception 'Loja não pertence à sua empresa' using errcode = '42501';
  end if;

  return app.next_store_number(p_store, p_kind);
end;
$$;

revoke execute on function public.next_store_number(uuid, text) from anon, public;
grant  execute on function public.next_store_number(uuid, text) to authenticated;

-- Reter o sinal do cliente precisa ficar registrado — e o registro de auditoria
-- só aceita escrita por função security definer (como o gatilho app.audit_row).
-- Então a retenção inteira (zerar o crédito + gravar quem reteve, quanto e por
-- quê) passa a acontecer dentro da própria função de retenção.

drop function if exists app.credit_forfeit(uuid, uuid);

create or replace function app.credit_forfeit(
  p_company     uuid,
  p_store       uuid,
  p_reservation uuid,
  p_reason      text
)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_total   numeric := 0;
  v_cliente uuid;
begin
  if p_company is distinct from app.current_company_id() then
    raise exception 'Empresa inválida';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Para ficar com o sinal do cliente é preciso dizer por quê';
  end if;

  select customer_id into v_cliente from public.reservations
   where id = p_reservation and company_id = p_company;

  select coalesce(sum(balance), 0) into v_total
    from public.store_credits
   where company_id = p_company and origin = 'deposit' and origin_id = p_reservation;

  update public.store_credits set balance = 0
   where company_id = p_company and origin = 'deposit' and origin_id = p_reservation
     and balance > 0;

  insert into public.audit_logs
    (company_id, store_id, user_id, action, table_name, record_id, after, reason)
  values
    (p_company, p_store, auth.uid(), 'update', 'reservations', p_reservation::text,
     jsonb_build_object('sinal_retido', v_total, 'cliente', v_cliente),
     trim(p_reason));

  return v_total;
end;
$$;

revoke all on function app.credit_forfeit(uuid, uuid, uuid, text) from public, anon;
grant execute on function app.credit_forfeit(uuid, uuid, uuid, text) to authenticated;

-- reservation_update sem a escrita direta na auditoria
create or replace function public.reservation_update(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_r        record;
  v_novo     public.reservation_status := (p ->> 'status')::public.reservation_status;
  v_unidade  uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_perder   boolean := coalesce((p ->> 'forfeit_deposit')::boolean, false);
  v_unit     record;
  v_perdido  numeric := 0;
begin
  select * into v_r from public.reservations
   where id = (p ->> 'id')::uuid and company_id = app.current_company_id()
   for update;
  if not found then
    raise exception 'Reserva não encontrada';
  end if;
  if not app.has_permission('sales.create', v_r.store_id) then
    raise exception 'Você não tem permissão para mexer nesta reserva';
  end if;
  if v_r.status in ('delivered', 'canceled', 'expired') then
    raise exception 'Esta reserva já foi encerrada (situação: %)', v_r.status;
  end if;
  if v_perder and not app.has_permission('sales.cancel', v_r.store_id) then
    raise exception 'Reter o sinal do cliente exige permissão de cancelamento de venda';
  end if;

  -- o aparelho encomendado chegou: passa a ser o aparelho desta reserva
  if v_unidade is not null and v_unidade is distinct from v_r.unit_id then
    select id, status, store_id into v_unit
      from public.serialized_units where id = v_unidade for update;
    if not found or v_unit.store_id <> v_r.store_id then
      raise exception 'Aparelho não está nesta loja';
    end if;
    if v_unit.status <> 'available' then
      raise exception 'Aparelho indisponível (situação: %)', v_unit.status;
    end if;
    update public.serialized_units set status = 'reserved', updated_at = now()
     where id = v_unidade;
    update public.reservations set unit_id = v_unidade where id = v_r.id;
    v_r.unit_id := v_unidade;
  end if;

  -- encerrou: o que estava segurado volta para a venda
  if v_novo in ('delivered', 'canceled', 'expired') then
    if v_r.unit_id is not null then
      update public.serialized_units
         set status = 'available', updated_at = now()
       where id = v_r.unit_id and status = 'reserved';
    elsif v_r.product_id is not null and v_r.status = 'available' then
      update public.stock_items
         set reserved = greatest(0, reserved - 1)
       where store_id = v_r.store_id and product_id = v_r.product_id
         and variant_id is not distinct from v_r.variant_id;
    end if;
  end if;

  -- sinal retido: decisão consciente, com motivo, valor e responsável gravados
  if v_perder and v_novo in ('canceled', 'expired') and v_r.deposit_amount > 0 then
    v_perdido := app.credit_forfeit(v_r.company_id, v_r.store_id, v_r.id, p ->> 'reason');
  end if;

  update public.reservations
     set status = v_novo,
         pickup_deadline = coalesce(nullif(p ->> 'pickup_deadline', '')::date, pickup_deadline),
         agreed_price = coalesce(nullif(p ->> 'agreed_price', '')::numeric, agreed_price),
         sale_id = coalesce(nullif(p ->> 'sale_id', '')::uuid, sale_id),
         notified_at = case when v_novo = 'available' then now() else notified_at end
   where id = v_r.id;

  return jsonb_build_object('ok', true, 'sinal_retido', v_perdido);
end;
$$;

revoke all on function public.reservation_update(jsonb) from public, anon;
grant execute on function public.reservation_update(jsonb) to authenticated;

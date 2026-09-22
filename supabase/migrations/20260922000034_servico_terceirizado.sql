-- Serviço terceirizado: o aparelho sai da loja para um laboratório.
--
-- É o ponto onde mais se perde dinheiro e aparelho numa assistência: o
-- equipamento fica fora, sem ninguém saber há quantos dias, quanto foi
-- combinado, nem se o que voltou é o que foi. Aqui cada remessa tem parceiro,
-- prazo, custo combinado e fotos; a conta do parceiro vira contas a pagar
-- quando o aparelho volta; e o custo entra no resultado da OS.
--
-- Regras que o banco garante:
--   · um aparelho só pode estar em um laboratório por vez;
--   · a situação só anda para frente (enviado → … → recebido);
--   · aparelho recebido exige data de retorno, e divergência fica registrada;
--   · o custo da OS é sempre a soma do que já foi aprovado com os parceiros.

alter table public.os_external_services
  add column if not exists payable_id uuid references public.payables(id),
  add column if not exists actual_cost numeric(14,2),
  add column if not exists created_by uuid references public.profiles(id);

create index if not exists idx_ext_abertos on public.os_external_services (status)
  where status <> 'received';

-- ordem das etapas: serve para impedir que a situação volte atrás
create or replace function app.external_ordem(p public.external_status)
returns int language sql immutable as $$
  select case p
    when 'sent' then 0 when 'in_analysis' then 1 when 'quoted' then 2
    when 'approved' then 3 when 'in_repair' then 4 when 'returning' then 5
    when 'received' then 6 end
$$;

-- ---------- enviar para o laboratório ----------
create or replace function public.os_external_send(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_os      record;
  v_parceiro text := trim(coalesce(p ->> 'partner_name', ''));
  v_forn    uuid := nullif(p ->> 'supplier_id', '')::uuid;
  v_custo   numeric := coalesce((p ->> 'agreed_cost')::numeric, 0);
  v_id      uuid;
begin
  select * into v_os from public.service_orders
   where id = (p ->> 'os_id')::uuid
     and company_id = app.current_company_id()
   for update;
  if not found then
    raise exception 'OS não encontrada';
  end if;
  if not app.has_permission('os.diagnose', v_os.store_id) then
    raise exception 'Você não tem permissão para movimentar esta OS';
  end if;
  if v_os.status in ('delivered', 'canceled') then
    raise exception 'OS já encerrada: não dá para mandar o aparelho para fora';
  end if;

  if v_forn is not null and v_parceiro = '' then
    select name into v_parceiro from public.suppliers
     where id = v_forn and company_id = app.current_company_id();
  end if;
  if coalesce(v_parceiro, '') = '' then
    raise exception 'Informe para quem o aparelho está indo';
  end if;
  if v_custo < 0 then
    raise exception 'Custo combinado não pode ser negativo';
  end if;

  -- o aparelho é um só: não pode estar em dois laboratórios
  perform 1 from public.os_external_services
   where os_id = v_os.id and status <> 'received';
  if found then
    raise exception 'Este aparelho já está em um laboratório. Registre o retorno antes de enviar de novo.';
  end if;

  insert into public.os_external_services (
    os_id, partner_name, supplier_id, status, sent_at, promised_at,
    agreed_cost, tracking_code, sent_photos, notes, created_by
  ) values (
    v_os.id, v_parceiro, v_forn, 'sent', now(),
    nullif(p ->> 'promised_at', '')::date,
    nullif(v_custo, 0), nullif(p ->> 'tracking_code', ''),
    coalesce(p -> 'sent_photos', '[]'::jsonb),
    nullif(p ->> 'notes', ''), auth.uid()
  ) returning id into v_id;

  -- na bancada o aparelho não está: a OS passa a aguardar retorno
  if v_os.status in ('approved', 'repairing') then
    update public.service_orders set status = 'awaiting_part' where id = v_os.id;
  end if;

  insert into public.os_comments (os_id, user_id, message, internal)
  values (v_os.id, auth.uid(),
          'Aparelho enviado para ' || v_parceiro ||
          coalesce(' · previsão ' || to_char(nullif(p ->> 'promised_at', '')::date, 'DD/MM/YYYY'), ''),
          true);

  return jsonb_build_object('id', v_id);
end;
$$;

-- ---------- andamento e retorno ----------
create or replace function public.os_external_update(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ext     record;
  v_os      record;
  v_novo    public.external_status := (p ->> 'status')::public.external_status;
  v_custo   numeric;
  v_pagar   uuid;
  v_total   numeric;
begin
  select e.* into v_ext from public.os_external_services e
    join public.service_orders o on o.id = e.os_id
   where e.id = (p ->> 'id')::uuid
     and o.company_id = app.current_company_id()
   for update;
  if not found then
    raise exception 'Envio não encontrado';
  end if;

  select * into v_os from public.service_orders where id = v_ext.os_id for update;
  if not app.has_permission('os.diagnose', v_os.store_id) then
    raise exception 'Você não tem permissão para movimentar esta OS';
  end if;

  if v_ext.status = 'received' then
    raise exception 'Este envio já foi encerrado';
  end if;
  if app.external_ordem(v_novo) < app.external_ordem(v_ext.status) then
    raise exception 'A situação não volta atrás (% para %)', v_ext.status, v_novo;
  end if;

  v_custo := coalesce((p ->> 'cost')::numeric, v_ext.actual_cost, v_ext.agreed_cost, 0);
  if v_custo < 0 then
    raise exception 'Custo não pode ser negativo';
  end if;

  update public.os_external_services
     set status        = v_novo,
         agreed_cost   = coalesce(nullif((p ->> 'agreed_cost')::numeric, 0), agreed_cost),
         actual_cost   = nullif(v_custo, 0),
         promised_at   = coalesce(nullif(p ->> 'promised_at', '')::date, promised_at),
         tracking_code = coalesce(nullif(p ->> 'tracking_code', ''), tracking_code),
         notes         = coalesce(nullif(p ->> 'notes', ''), notes),
         divergence    = coalesce(nullif(p ->> 'divergence', ''), divergence),
         return_photos = case when p ? 'return_photos'
                              then p -> 'return_photos' else return_photos end,
         received_at   = case when v_novo = 'received' then now() else received_at end
   where id = v_ext.id;

  -- custo do parceiro entra na OS a partir do momento em que foi aprovado
  select coalesce(sum(coalesce(actual_cost, agreed_cost, 0)), 0) into v_total
    from public.os_external_services
   where os_id = v_ext.os_id
     and status in ('approved', 'in_repair', 'returning', 'received');
  update public.service_orders set cost_external = v_total where id = v_ext.os_id;

  -- aparelho de volta e conta combinada: vira contas a pagar do parceiro
  if v_novo = 'received' and v_custo > 0 and v_ext.payable_id is null then
    insert into public.payables (
      company_id, store_id, supplier_id, description, due_date, amount,
      status, created_by
    ) values (
      v_os.company_id, v_os.store_id, v_ext.supplier_id,
      'Serviço externo · OS #' || v_os.number || ' · ' || v_ext.partner_name,
      coalesce(nullif(p ->> 'due_date', '')::date, current_date),
      v_custo, 'open', auth.uid()
    ) returning id into v_pagar;

    update public.os_external_services set payable_id = v_pagar where id = v_ext.id;
  end if;

  if v_novo = 'received' then
    insert into public.os_comments (os_id, user_id, message, internal)
    values (v_os.id, auth.uid(),
            'Aparelho recebido de volta de ' || v_ext.partner_name ||
            case when nullif(p ->> 'divergence', '') is not null
                 then ' · divergência: ' || (p ->> 'divergence') else '' end,
            true);
  end if;

  return jsonb_build_object('ok', true, 'payable_id', v_pagar, 'cost_external', v_total);
end;
$$;

revoke all on function public.os_external_send(jsonb)   from public, anon;
revoke all on function public.os_external_update(jsonb) from public, anon;
grant execute on function public.os_external_send(jsonb)   to authenticated;
grant execute on function public.os_external_update(jsonb) to authenticated;

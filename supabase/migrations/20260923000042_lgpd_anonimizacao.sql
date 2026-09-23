-- LGPD: anonimizar o cliente que pediu para sair.
--
-- "Apagar o cliente" não existe numa loja: nota fiscal, ordem de serviço e
-- crediário têm prazo legal de guarda, e apagar a linha levaria junto o
-- histórico de vendas. O que a lei pede — e o que o sistema faz aqui — é tirar
-- o que identifica a pessoa (nome, CPF, RG, contato, endereço, observações) e
-- manter os documentos que a loja é obrigada a guardar, agora ligados a um
-- cliente sem nome.
--
-- É irreversível de propósito, exige permissão, e fica registrado na auditoria
-- quem anonimizou, quando e por qual pedido.
--
-- Não anonimiza quem ainda tem conta aberta com a loja: crediário a receber,
-- aparelho na assistência ou reserva em andamento. Nesses casos a loja tem
-- interesse legítimo em manter o dado até encerrar a relação — e, na prática,
-- sem nome ninguém entrega o aparelho para a pessoa certa depois.

create or replace function public.lgpd_anonymize(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company   uuid := app.current_company_id();
  v_cliente   uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_pedido    uuid := nullif(p ->> 'request_id', '')::uuid;
  v_nome      text;
  v_divida    numeric;
  v_os        int;
  v_reserva   int;
  v_apelido   text;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;
  if not app.is_admin() then
    raise exception 'Só o dono ou gerente pode anonimizar um cliente';
  end if;

  select name into v_nome from public.customers
   where id = v_cliente and company_id = v_company and not anonymized;
  if v_nome is null then
    raise exception 'Cliente não encontrado (ou já anonimizado)';
  end if;

  select coalesce(sum(amount - coalesce(paid_amount, 0)), 0) into v_divida
    from public.receivables
   where customer_id = v_cliente and status in ('open', 'partial');
  if v_divida > 0 then
    raise exception 'Cliente tem R$ % em aberto no crediário: encerre a cobrança antes de anonimizar', v_divida;
  end if;

  select count(*) into v_os from public.service_orders
   where customer_id = v_cliente and status not in ('delivered', 'canceled');
  if v_os > 0 then
    raise exception 'Cliente tem % ordem(ns) de serviço em andamento', v_os;
  end if;

  select count(*) into v_reserva from public.reservations
   where customer_id = v_cliente and status in ('awaiting_purchase', 'on_the_way', 'available');
  if v_reserva > 0 then
    raise exception 'Cliente tem % reserva(s) em andamento', v_reserva;
  end if;

  v_apelido := 'Cliente anonimizado ' || substr(v_cliente::text, 1, 8);

  update public.customers
     set name = v_apelido,
         cpf_cnpj = null, rg = null, birthdate = null,
         email = null, phone = null, whatsapp = null,
         address = '{}'::jsonb, notes = null, origin = null,
         consent_contact = false, consent_at = null,
         anonymized = true, active = false, updated_at = now()
   where id = v_cliente;

  -- conversas guardadas viram histórico sem conteúdo pessoal
  update public.messages
     set body = '[removido a pedido do titular]', media_url = null
   where customer_id = v_cliente;

  update public.customer_devices
     set notes = null
   where customer_id = v_cliente;

  if v_pedido is not null then
    update public.lgpd_requests
       set status = 'done', completed_at = now(), handled_by = auth.uid()
     where id = v_pedido and company_id = v_company;
  end if;

  insert into public.audit_logs
    (company_id, user_id, action, table_name, record_id, after, reason)
  values
    (v_company, auth.uid(), 'update', 'customers', v_cliente::text,
     jsonb_build_object('anonimizado', true, 'pedido', v_pedido),
     'LGPD: anonimização a pedido do titular');

  return jsonb_build_object('ok', true, 'nome_anterior', v_nome, 'novo_nome', v_apelido);
end;
$$;

revoke all on function public.lgpd_anonymize(jsonb) from public, anon;
grant execute on function public.lgpd_anonymize(jsonb) to authenticated;

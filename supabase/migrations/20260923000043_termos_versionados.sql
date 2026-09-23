-- Termos da loja: serviço, garantia, troca, recibo.
--
-- O termo impresso na OS é o que o cliente assina. Se a loja edita o texto em
-- cima do antigo, a OS assinada mês passado passa a "apontar" para um texto
-- que o cliente nunca viu — e numa discussão no Procon é a loja que perde.
--
-- Por isso editar termo aqui nunca altera o texto anterior: cria uma versão
-- nova, desativa a anterior e guarda quem escreveu. A OS grava o número da
-- versão vigente no momento do check-in, e a impressão usa aquela versão.

create or replace function public.term_publish(p jsonb)
returns jsonb
language plpgsql
-- definer por causa do registro de auditoria, que só aceita escrita assim;
-- a empresa e a permissão são conferidas logo na entrada
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.current_company_id();
  v_kind    text := nullif(trim(p ->> 'kind'), '');
  v_body    text := nullif(trim(p ->> 'body'), '');
  v_versao  int;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;
  if not app.is_admin() then
    raise exception 'Só o dono ou gerente pode alterar os termos da loja';
  end if;
  if v_kind is null or v_kind not in
     ('service_term', 'warranty_term', 'exchange_policy', 'privacy_policy', 'receipt_message') then
    raise exception 'Tipo de termo inválido';
  end if;
  if v_body is null then
    raise exception 'O texto do termo não pode ficar vazio';
  end if;

  select coalesce(max(version), 0) + 1 into v_versao
    from public.terms where company_id = v_company and kind = v_kind;

  update public.terms set active = false
   where company_id = v_company and kind = v_kind and active;

  insert into public.terms (company_id, kind, version, body, active, created_by)
  values (v_company, v_kind, v_versao, v_body, true, auth.uid());

  insert into public.audit_logs
    (company_id, user_id, action, table_name, record_id, after, reason)
  values
    (v_company, auth.uid(), 'insert', 'terms', v_kind,
     jsonb_build_object('versao', v_versao), 'Nova versão do termo publicada');

  return jsonb_build_object('kind', v_kind, 'version', v_versao);
end;
$$;

revoke all on function public.term_publish(jsonb) from public, anon;
grant execute on function public.term_publish(jsonb) to authenticated;

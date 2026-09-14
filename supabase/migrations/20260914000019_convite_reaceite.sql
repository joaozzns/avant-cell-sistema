-- ============================================================
-- AVANT CELL · Convite já usado não "reaceita" quem saiu da equipe
-- invite_accept respondia ja_aceito=true a quem tinha aceitado antes,
-- mesmo depois de removido da equipe. O acesso não voltava (nada era
-- regravado), mas a resposta enganava: a tela mandava ao painel e a
-- pessoa caía na criação de empresa. Agora só é "já aceito" quem ainda
-- está na empresa e na loja do convite; os demais recebem "já usado".
-- ============================================================
create or replace function public.invite_accept(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v         public.company_invites;
  v_uid     uuid := auth.uid();
  v_email   text;
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar o convite' using errcode = '42501';
  end if;

  select * into v from public.company_invites where token = p_token for update;
  if not found then
    raise exception 'Convite não encontrado';
  end if;
  if v.revoked_at is not null then
    raise exception 'Este convite foi cancelado. Peça um novo ao responsável';
  end if;
  if v.accepted_at is not null then
    if v.accepted_by = v_uid
       and exists (select 1 from public.profiles p where p.id = v_uid and p.company_id = v.company_id)
       and exists (select 1 from public.user_stores us where us.user_id = v_uid and us.store_id = v.store_id) then
      return jsonb_build_object('company_id', v.company_id, 'store_id', v.store_id, 'ja_aceito', true);
    end if;
    raise exception 'Este convite já foi usado. Peça um novo ao responsável';
  end if;
  if v.expires_at < now() then
    raise exception 'Este convite expirou. Peça um novo ao responsável';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v.email is not null and lower(v.email) <> lower(coalesce(v_email, '')) then
    raise exception 'Este convite é para outro e-mail (%). Entre com a conta desse e-mail',
      regexp_replace(v.email, '^(.)[^@]*(@.*)$', '\1***\2');
  end if;

  select company_id into v_company from public.profiles where id = v_uid for update;
  if v_company is not null and v_company <> v.company_id then
    raise exception 'Sua conta já pertence a outra empresa. Use outro e-mail para entrar nesta equipe';
  end if;

  if exists (select 1 from public.user_stores where user_id = v_uid and store_id = v.store_id) then
    raise exception 'Você já faz parte desta loja';
  end if;

  update public.profiles set company_id = v.company_id, active = true where id = v_uid;
  insert into public.user_stores (user_id, store_id, role_id) values (v_uid, v.store_id, v.role_id);
  update public.company_invites set accepted_by = v_uid, accepted_at = now() where id = v.id;

  return jsonb_build_object('company_id', v.company_id, 'store_id', v.store_id, 'ja_aceito', false);
end;
$$;

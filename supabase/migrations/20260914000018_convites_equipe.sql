-- ============================================================
-- AVANT CELL · Convite de equipe por link
-- O dono/admin gera um link para uma loja e um papel; quem abre entra na
-- empresa com esse acesso, sem passar pela criação de empresa. O link
-- vale 7 dias, serve uma vez e pode ser restrito a um e-mail.
-- Gestão da equipe (mudar papel, remover) passa por funções que conferem
-- empresa e hierarquia, porque a RLS de vínculos não deixa — de propósito
-- — tirar alguém da empresa pela API comum.
-- ============================================================

create table public.company_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  role_id     uuid not null references public.roles(id),
  email       text,                                   -- se preenchido, só esse e-mail aceita
  token       uuid not null unique default gen_random_uuid(),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_by  uuid references public.profiles(id),
  revoked_at  timestamptz
);
create index company_invites_company_idx on public.company_invites (company_id, created_at desc);
create index company_invites_store_idx   on public.company_invites (store_id);
create index company_invites_role_idx    on public.company_invites (role_id);

alter table public.company_invites enable row level security;

create policy invites_select on public.company_invites for select to authenticated
  using (company_id = app.current_company_id() and app.is_admin());

create policy invites_insert on public.company_invites for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.is_admin()
    and created_by = (select auth.uid())
    and exists (select 1 from public.stores s
                 where s.id = company_invites.store_id and s.company_id = app.current_company_id() and s.active)
    and exists (select 1 from public.roles r
                 where r.id = company_invites.role_id and r.key <> 'owner'
                   and (r.company_id is null or r.company_id = app.current_company_id()))
  );
-- sem policy de update/delete: cancelar e aceitar só pelas funções abaixo

create trigger trg_audit_company_invites
  after insert or update or delete on public.company_invites
  for each row execute function app.audit_row();

-- ---------- pré-visualização (abre sem login, só com o link) ----------
create or replace function public.invite_preview(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v record; v_status text;
begin
  select i.*, c.name as company_name, s.name as store_name, r.name as role_name
    into v
    from public.company_invites i
    join public.companies c on c.id = i.company_id
    join public.stores s    on s.id = i.store_id
    join public.roles r     on r.id = i.role_id
   where i.token = p_token;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_status := case
    when v.revoked_at  is not null then 'revoked'
    when v.accepted_at is not null then 'used'
    when v.expires_at  < now()     then 'expired'
    else 'valid' end;

  -- nomes só aparecem para convite válido
  if v_status <> 'valid' then
    return jsonb_build_object('status', v_status);
  end if;
  return jsonb_build_object(
    'status', v_status,
    'company_name', v.company_name,
    'store_name', v.store_name,
    'role_name', v.role_name,
    'email_hint', case when v.email is null then null
                       else regexp_replace(v.email, '^(.)[^@]*(@.*)$', '\1***\2') end,
    'expires_at', v.expires_at
  );
end;
$$;

-- ---------- aceitar ----------
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
    if v.accepted_by = v_uid then
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

  -- quem já está nesta loja não é rebaixado por um convite
  if exists (select 1 from public.user_stores where user_id = v_uid and store_id = v.store_id) then
    raise exception 'Você já faz parte desta loja';
  end if;

  update public.profiles set company_id = v.company_id, active = true where id = v_uid;
  insert into public.user_stores (user_id, store_id, role_id) values (v_uid, v.store_id, v.role_id);
  update public.company_invites set accepted_by = v_uid, accepted_at = now() where id = v.id;

  return jsonb_build_object('company_id', v.company_id, 'store_id', v.store_id, 'ja_aceito', false);
end;
$$;

-- ---------- cancelar ----------
create or replace function public.invite_revoke(p_invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Apenas administradores gerenciam convites' using errcode = '42501';
  end if;
  update public.company_invites
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_invite
     and company_id = app.current_company_id()
     and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'Convite não encontrado ou já usado';
  end if;
end;
$$;

-- ---------- mudar papel ----------
create or replace function public.team_set_role(p_user uuid, p_store uuid, p_role uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_company uuid := app.current_company_id();
begin
  if not app.is_admin() or v_company is null then
    raise exception 'Apenas administradores gerenciam a equipe' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode alterar o próprio papel';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and company_id = v_company) then
    raise exception 'Usuário não pertence à sua empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stores where id = p_store and company_id = v_company) then
    raise exception 'Loja não pertence à sua empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles where id = p_role and key <> 'owner'
                   and (company_id is null or company_id = v_company)) then
    raise exception 'Papel inválido';
  end if;
  if exists (select 1 from public.user_stores us join public.roles r on r.id = us.role_id
              where us.user_id = p_user and us.store_id = p_store and r.key = 'owner') then
    raise exception 'O papel do dono não pode ser alterado';
  end if;

  update public.user_stores set role_id = p_role where user_id = p_user and store_id = p_store;
  if not found then
    raise exception 'Usuário não está vinculado a esta loja';
  end if;
end;
$$;

-- ---------- remover da equipe ----------
create or replace function public.team_remove_member(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_company uuid := app.current_company_id();
begin
  if not app.is_admin() or v_company is null then
    raise exception 'Apenas administradores gerenciam a equipe' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode remover a si mesmo';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and company_id = v_company) then
    raise exception 'Usuário não pertence à sua empresa' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_stores us
               join public.roles r on r.id = us.role_id
               join public.stores s on s.id = us.store_id
              where us.user_id = p_user and s.company_id = v_company and r.key = 'owner') then
    raise exception 'O dono não pode ser removido da empresa';
  end if;

  -- sem vínculo e sem empresa, a RLS corta o acesso na hora (a sessão aberta perde tudo)
  delete from public.user_stores us
   using public.stores s
   where s.id = us.store_id and s.company_id = v_company and us.user_id = p_user;
  update public.profiles set company_id = null, active = false where id = p_user;
end;
$$;

revoke execute on function public.invite_preview(uuid)                from public;
revoke execute on function public.invite_accept(uuid)                 from public, anon;
revoke execute on function public.invite_revoke(uuid)                 from public, anon;
revoke execute on function public.team_set_role(uuid, uuid, uuid)     from public, anon;
revoke execute on function public.team_remove_member(uuid)            from public, anon;
grant  execute on function public.invite_preview(uuid)                to anon, authenticated, service_role;
grant  execute on function public.invite_accept(uuid)                 to authenticated, service_role;
grant  execute on function public.invite_revoke(uuid)                 to authenticated, service_role;
grant  execute on function public.team_set_role(uuid, uuid, uuid)     to authenticated, service_role;
grant  execute on function public.team_remove_member(uuid)            to authenticated, service_role;

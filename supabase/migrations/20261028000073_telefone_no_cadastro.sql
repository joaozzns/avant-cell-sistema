-- O telefone de quem cria a conta
--
-- A tela de cadastro passou a pedir telefone. O perfil já tinha a coluna
-- phone, mas quem cria o perfil é o gatilho de usuário novo, e ele só
-- copiava o nome dos metadados — o telefone chegava no auth.users e parava
-- ali, sem nunca virar dado da loja.
--
-- Agora o gatilho copia os dois. Vale para quem se cadastra pelo site e
-- para quem aceita convite: os dois caminhos passam por aqui.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

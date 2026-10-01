-- A tela de assinatura chamava uma função que o PostgREST não enxerga
--
-- `app.assinatura()` vive no esquema `app`, que não é exposto pela API. A
-- página /assinatura chamava `rpc("assinatura")` e recebia PGRST202 — função
-- não encontrada. O cartão de situação ficava em branco, sem erro visível:
-- a loja não via nem que estava em dia, nem que estava vencida.
--
-- E a função original aceita um id de empresa qualquer. Dentro do banco isso
-- é inofensivo, porque só gatilhos a chamam; exposta pela API seria um
-- usuário logado consultando a situação de pagamento de outra loja. Por isso
-- o que vai para a API não recebe parâmetro nenhum: responde sempre sobre a
-- empresa de quem perguntou.

create or replace function public.minha_assinatura()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select app.assinatura(app.current_company_id())
$$;

revoke all on function public.minha_assinatura() from public, anon;
grant execute on function public.minha_assinatura() to authenticated;

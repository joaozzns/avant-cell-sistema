-- A rotina diária estava aberta na internet
--
-- A migração 066 escreveu `revoke execute ... from public, authenticated`,
-- mas o Supabase concede execução ao papel `anon` por conta própria, e esse
-- grant continuou de pé: qualquer pessoa com o endereço do projeto podia
-- chamar `/rest/v1/rpc/assinaturas_vencer_carencia` sem fazer login.
--
-- O estrago seria limitado — a rotina só mexe em quem já passou da carência,
-- e rodar duas vezes dá no mesmo —, mas manutenção não fica aberta. Quem
-- chama é o pg_cron, que roda como `postgres` e não depende destes grants.

revoke execute on function public.assinaturas_vencer_carencia() from anon;
revoke execute on function public.assinaturas_vencer_carencia() from authenticated;
revoke execute on function public.assinaturas_vencer_carencia() from public;

-- Resto do ensaio da comissão (01/10/2026).
--
-- As comissões e as assinaturas de teste já saíram pela API, com a sessão do
-- usuário. As empresas e o representante não: o RLS não deixa um lojista
-- apagar empresa — e está certo que não deixe. Então ficam estas três linhas,
-- para rodar no SQL Editor, onde a chave de serviço passa por cima do RLS.
--
-- A ordem importa: a empresa aponta para o representante.

begin;

delete from public.companies where name like 'ZZTESTE%';

delete from public.partners where name like 'ZZTESTE%';

commit;

-- Conferência: devem sobrar 1 empresa (AVANT CELL) e 2 representantes
-- (Bruno Vendas e Carla Parceira).
--   select name from public.companies;
--   select name from public.partners;

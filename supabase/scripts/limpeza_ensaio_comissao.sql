-- Remove o ensaio da comissão feito em 01/10/2026.
--
-- Para conferir a regra nova (mensalidade inteira no mensal, mais 10% no
-- anual) criei um representante e duas lojas de mentira, confirmei o
-- pagamento das duas e li o resultado. Os valores saíram certos — R$ 97,00 e
-- R$ 216,70 — e o aviso repetido não pagou duas vezes.
--
-- Estas quatro linhas tiram o cenário do banco. A ordem importa: a comissão
-- aponta para a assinatura, que aponta para a empresa, que aponta para o
-- representante.

begin;

delete from public.partner_earnings
 where company_id in (select id from public.companies where name like 'ZZTESTE%');

delete from public.subscriptions
 where company_id in (select id from public.companies where name like 'ZZTESTE%');

delete from public.companies where name like 'ZZTESTE%';

delete from public.partners where name like 'ZZTESTE%';

commit;

-- Conferência: as quatro contagens devem voltar ao que eram —
-- nenhuma comissão, um representante a menos, uma empresa (a de demonstração).
--   select count(*) from public.partner_earnings;
--   select count(*) from public.partners;
--   select count(*) from public.companies;

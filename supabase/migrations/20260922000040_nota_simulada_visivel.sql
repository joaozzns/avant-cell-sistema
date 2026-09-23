-- Nota simulada tem que gritar que é simulada.
--
-- Sem emissor contratado, o sistema gera chave e protocolo fictícios e grava a
-- nota como 'authorized' — útil para a loja treinar o fluxo antes de contratar.
-- O problema é que no monitor ela aparecia igualzinha a uma nota de verdade:
-- "Autorizada", com chave de 44 dígitos e um "homolog." discreto na coluna do
-- lado. Um lojista que confia nisso deixa de emitir nota fiscal de verdade e
-- descobre meses depois, com o contador ou com a fiscalização.
--
-- Aqui a simulação vira um campo próprio, e o banco impede que uma nota
-- simulada se apresente como nota de produção.

alter table public.fiscal_documents
  add column if not exists simulated boolean not null default false;

-- o que já foi emitido em modo simulado carrega a marca
update public.fiscal_documents
   set simulated = true
 where simulated = false
   and (gateway_payload ->> 'simulated')::boolean is true;

create index if not exists idx_fiscal_simuladas
  on public.fiscal_documents (company_id) where simulated;

-- nota simulada nunca é de produção, nem com alteração direta na tabela
alter table public.fiscal_documents
  drop constraint if exists ck_fiscal_simulada_homolog;
alter table public.fiscal_documents
  add constraint ck_fiscal_simulada_homolog
  check (not simulated or environment <> 'production');

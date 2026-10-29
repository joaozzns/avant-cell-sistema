-- Categorias separadas para acessórios e aparelhos
-- ----------------------------------------------------------------------
-- O menu Estoque ganhou Acessórios e Aparelhos, cada um com as próprias
-- categorias ("Capinhas", "Películas" de um lado; "iPhone", "Seminovos"
-- do outro). Antes era uma lista só, e o cadastro de capinha oferecia
-- "Seminovos" como categoria.
--
-- kind nulo = categoria antiga, sem tipo: continua aparecendo nos dois
-- lados, para nenhum produto já cadastrado perder a categoria.

alter table public.categories
  add column if not exists kind text
  check (kind in ('device', 'accessory'));

create index if not exists categories_company_kind_idx
  on public.categories (company_id, kind);

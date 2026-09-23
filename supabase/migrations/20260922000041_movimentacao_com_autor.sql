-- Quem fez a movimentação de estoque.
--
-- stock_movements.user_id era um uuid solto, sem chave estrangeira para
-- profiles. A tela de movimentações pedia o nome de quem fez o lançamento e a
-- consulta inteira falhava — a tela mostrava "nenhuma movimentação" mesmo com
-- o estoque se mexendo, e ninguém percebia porque erro de consulta não
-- aparece na tela, só some o conteúdo.
--
-- Com a chave declarada, a ligação passa a existir de verdade: o nome aparece
-- e o banco garante que o autor registrado é alguém que existe.

alter table public.stock_movements
  drop constraint if exists fk_stock_movements_user;

alter table public.stock_movements
  add constraint fk_stock_movements_user
  foreign key (user_id) references public.profiles(id);

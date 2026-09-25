-- A gaveta aceitava qualquer saída, de qualquer valor, de qualquer um
--
-- Sondagem de 25/09/2026: uma sangria de R$ 999.999,00 num caixa com
-- R$ 2.659,50 foi aceita, e o esperado do fechamento foi para
-- -R$ 997.339,50. Não havia checagem nenhuma: a tela de caixa insere direto
-- em cash_movements, e a política de segurança só pergunta se a pessoa
-- trabalha naquela loja.
--
-- Pior: a tela de permissões oferece "Fazer sangria (limite em R$)" desde o
-- primeiro dia, o seed configura R$ 2.000 para o gerente — e `app.permission_limit`,
-- que lê esse limite, nunca foi chamada em lugar nenhum do sistema. O limite
-- existia só no visual.
--
-- A trava fica no banco, não na tela, porque a tela é só um dos caminhos até
-- a gaveta.
--
-- Sangria feita à mão (sem documento) passa a exigir permissão e respeitar o
-- limite. Saída que nasce de um documento — devolução, compra de aparelho
-- usado — continua livre de permissão de sangria, porque quem a autorizou foi
-- a operação que a gerou; mas nenhuma saída pode ser maior que o que existe
-- na gaveta.

create or replace function app.cash_movement_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_sessao      record;
  v_disponivel  numeric;
  v_limite      numeric;
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'O valor do movimento de caixa precisa ser maior que zero';
  end if;

  select * into v_sessao from public.cash_sessions where id = new.session_id;
  if not found then
    raise exception 'Caixa não encontrado';
  end if;
  if v_sessao.status <> 'open' then
    raise exception 'Este caixa já foi fechado';
  end if;
  if v_sessao.store_id is distinct from new.store_id then
    raise exception 'O movimento é de outra loja';
  end if;

  -- sangria à mão: sem documento por trás, então precisa de quem responda por ela
  if new.type = 'withdrawal' and new.ref_id is null then
    if not app.has_permission('cash.withdrawal', new.store_id) then
      raise exception 'Você não tem permissão para fazer sangria';
    end if;
    v_limite := app.permission_limit('cash.withdrawal', new.store_id);
    if v_limite is not null and new.amount > v_limite and not app.is_admin() then
      raise exception 'Sangria de %, acima do seu limite de %',
        app.brl(new.amount), app.brl(v_limite);
    end if;
  end if;

  -- não sai da gaveta o que não está nela
  if new.type in ('withdrawal', 'refund') then
    v_disponivel := (public.cash_expected(new.session_id) ->> 'cash')::numeric;
    if new.amount > v_disponivel then
      raise exception 'O caixa tem % e a saída é de %. Faça um suprimento ou use outra forma.',
        app.brl(v_disponivel), app.brl(new.amount);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cash_movement_guard on public.cash_movements;
create trigger trg_cash_movement_guard
  before insert on public.cash_movements
  for each row execute function app.cash_movement_guard();

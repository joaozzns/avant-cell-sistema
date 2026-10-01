-- A carência vence sozinha, e o cancelamento também fecha a porta
--
-- Duas coisas que faltavam para a trava de 30/09 funcionar sem ninguém olhar:
--
-- 1. Ninguém chamava `assinaturas_vencer_carencia`. A loja que não pagava
--    entrava em `past_due` com cinco dias de prazo e ficava ali para sempre,
--    porque `past_due` é justamente o estado que ainda deixa operar. A trava
--    existia e nunca disparava.
--
-- 2. Assinatura cancelada continuava escrevendo. `app.assinatura()` só fecha
--    a porta no estado `read_only`, e o webhook marca `canceled` quando o
--    lojista cancela no Mercado Pago. Quem cancelasse ficaria com o sistema
--    inteiro, de graça, sem prazo. O justo é o que ele já pagou: vale até o
--    fim do período contratado, e depois vira consulta.

create or replace function public.assinaturas_vencer_carencia()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_carencia int; v_cancelada int;
begin
  -- quem não pagou e já passou dos cinco dias
  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'past_due'
     and grace_until is not null
     and grace_until < current_date;
  get diagnostics v_carencia = row_count;

  -- quem cancelou e já consumiu o período que pagou
  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'canceled'
     and current_period_end is not null
     and current_period_end < current_date;
  get diagnostics v_cancelada = row_count;

  return jsonb_build_object(
    'carencia_vencida', v_carencia,
    'cancelamento_consumido', v_cancelada,
    'rodou_em', now());
end;
$$;

revoke execute on function public.assinaturas_vencer_carencia() from public, authenticated;

-- ---------- o agendador ----------
create extension if not exists pg_cron;

-- 06:00 UTC = 03:00 em Brasília: fora do horário de loja, para que ninguém
-- veja o sistema travar no meio de uma venda.
select cron.unschedule('assinaturas-diaria')
 where exists (select 1 from cron.job where jobname = 'assinaturas-diaria');

select cron.schedule(
  'assinaturas-diaria',
  '0 6 * * *',
  $cron$ select public.assinaturas_vencer_carencia() $cron$
);

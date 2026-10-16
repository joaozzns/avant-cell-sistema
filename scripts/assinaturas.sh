#!/usr/bin/env bash
# Quem está pagando, quem está em teste e quem está devendo.
#
# Precisa da chave service_role: a tabela subscriptions tem RLS, e com a
# chave pública ela devolve zero linhas para qualquer um.
#
#   Supabase > Project Settings > API > service_role  (copie)
#   export SUPABASE_SERVICE_ROLE_KEY='...'            (com espaço na frente!)
#   ./scripts/assinaturas.sh
#
# O espaço antes do export faz o zsh não gravar a linha no histórico. Essa
# chave ignora o RLS de todas as lojas: quem tiver o valor lê e escreve o
# banco inteiro.

set -euo pipefail

URL="${NEXT_PUBLIC_SUPABASE_URL:-https://jeqngqcpoeaezfpazbzk.supabase.co}"
CHAVE="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$CHAVE" ]; then
  echo "Falta SUPABASE_SERVICE_ROLE_KEY no ambiente." >&2
  echo "  Supabase > Project Settings > API > service_role" >&2
  echo "  Depois:  export SUPABASE_SERVICE_ROLE_KEY='...'   (com espaço na frente)" >&2
  exit 1
fi

consulta() {
  curl -sS --fail-with-body \
    "$URL/rest/v1/subscriptions?select=status,charge_period,monthly_amount,current_period_end,grace_until,last_payment_at,mp_preapproval_id,companies(name,trade_name),saas_plans(name),partners(name)&order=status,current_period_end" \
    -H "apikey: $CHAVE" -H "Authorization: Bearer $CHAVE"
}

consulta | jq -r '
  def brl: if . == null then "—" else "R$ " + (.|tonumber|.*100|round/100|tostring) end;
  def dia: if . == null then "—" else (.[8:10] + "/" + .[5:7] + "/" + .[0:4]) end;
  def loja: (.companies.trade_name // .companies.name // "—");

  (map(select(.status == "active")) | length) as $ativas
  | (map(select(.status == "active") | .monthly_amount // 0) | add // 0) as $mrr
  | (map(select(.status == "trial")) | length) as $teste
  | (map(select(.status == "past_due" or .status == "read_only")) | length) as $atraso
  |
  "ASSINATURAS ATIVAS: \($ativas)    MRR: R$ \($mrr)",
  "em teste: \($teste)    em atraso ou bloqueada: \($atraso)",
  "",
  (if $ativas == 0 then "Nenhuma assinatura ativa." else empty end),
  (
    group_by(.status)[]
    | (.[0].status) as $bruto
    | ({ "active": "PAGANDO", "trial": "EM TESTE", "past_due": "EM ATRASO",
         "read_only": "BLOQUEADA (só leitura)", "canceled": "CANCELADA" }[$bruto] // ($bruto | ascii_upcase)) as $s
    | "── \($s) (\(length)) ──",
      (.[] | "   \(loja | .[0:26] | . + (" " * (26 - length)))  "
             + "\(.saas_plans.name // "sem plano" | .[0:14] | . + (" " * (14 - length)))  "
             + "\(.monthly_amount | brl | .[0:11] | . + (" " * (11 - length)))"
             + "\(if .charge_period == "annual" then "anual  " else "mensal " end)"
             + " vence \(.current_period_end | dia)"
             + (if .grace_until then "  carência até \(.grace_until | dia)" else "" end)
             + (if .mp_preapproval_id then "" else "  [sem link no Mercado Pago]" end)
             + (if .partners.name then "  rep: \(.partners.name)" else "" end)),
      ""
  )
'

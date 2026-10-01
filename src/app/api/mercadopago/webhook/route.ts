import { createHmac, timingSafeEqual } from "node:crypto";
import { clienteDeServico } from "@/lib/supabase/servico";

/**
 * Avisos de cobrança do Mercado Pago.
 *
 * O Mercado Pago não manda o que aconteceu: manda um id e o assunto, e espera
 * que a gente pergunte a ele o estado atual. Por isso todo aviso vira uma
 * consulta à API antes de virar decisão.
 *
 * Três cuidados que não são opcionais:
 *
 *  1. Assinatura. Sem conferir o cabeçalho x-signature, qualquer pessoa com o
 *     endereço do webhook manda um POST dizendo que a loja dela pagou. É a
 *     porta mais óbvia do sistema inteiro.
 *  2. Responder 200 rápido. Resposta que não é 2xx faz o Mercado Pago repetir
 *     o aviso por horas. Mesmo quando o aviso não serve para nada, a resposta
 *     é 200 — o que interessa fica guardado em subscription_events.
 *  3. Aviso repetido. O mesmo evento chega mais de uma vez, é normal. Por isso
 *     o estado vem sempre da consulta à API, e não do que o aviso diz: aplicar
 *     duas vezes o mesmo estado não muda nada.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MP = "https://api.mercadopago.com";
const DIAS_DE_CARENCIA = 5;

/** O Mercado Pago assina `id:<id>;request-id:<req>;ts:<ts>;` com o segredo. */
function assinaturaConfere(corpoId: string, cabecalhos: Headers): boolean {
  const segredo = process.env.MP_WEBHOOK_SECRET;
  if (!segredo) return false;

  const assinatura = cabecalhos.get("x-signature");
  const requisicao = cabecalhos.get("x-request-id") ?? "";
  if (!assinatura) return false;

  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => {
      const [k, ...resto] = p.split("=");
      return [k.trim(), resto.join("=").trim()];
    })
  );
  const ts = partes["ts"];
  const v1 = partes["v1"];
  if (!ts || !v1) return false;

  const manifesto = `id:${corpoId};request-id:${requisicao};ts:${ts};`;
  const esperado = createHmac("sha256", segredo).update(manifesto).digest("hex");

  /* comparação de tempo constante: comparar com === vaza, pelo tempo de
     resposta, quantos caracteres do começo estavam certos */
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function perguntarAoMercadoPago(caminho: string) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN no ambiente.");
  const r = await fetch(`${MP}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/** O vocabulário deles, no nosso. */
function situacao(estado: string): string {
  switch (estado) {
    case "authorized": return "active";
    case "pending":    return "trial";
    case "paused":     return "past_due";
    case "cancelled":  return "canceled";
    default:           return estado;
  }
}

export async function POST(req: Request) {
  const cru = await req.text();
  let aviso: Record<string, unknown> = {};
  try {
    aviso = JSON.parse(cru || "{}");
  } catch {
    /* corpo ilegível: guarda e encerra em 200, senão o Mercado Pago insiste */
  }

  const dados = (aviso.data ?? {}) as { id?: string };
  const recurso = String(dados.id ?? aviso.id ?? "");
  const assunto = String(aviso.type ?? aviso.topic ?? "");
  const ok = assinaturaConfere(recurso, req.headers);

  const supabase = clienteDeServico();
  const { data: registro } = await supabase
    .from("subscription_events")
    .insert({
      mp_resource_id: recurso || null,
      mp_topic: assunto || null,
      payload: aviso,
      signature_ok: ok,
    })
    .select("id")
    .single();

  /* assinatura errada: fica registrado para investigar, mas nada é aplicado */
  if (!ok) {
    return Response.json({ recebido: true, aplicado: false }, { status: 200 });
  }

  try {
    if (assunto === "subscription_preapproval" && recurso) {
      const a = await perguntarAoMercadoPago(`/preapproval/${recurso}`);

      /* Primeiro aviso de uma assinatura nova: nenhuma linha tem este
         preapproval ainda. O elo é a referência externa, que o link de
         assinatura carrega com o id da empresa — sem ela o pagamento entra
         na conta e o sistema não sabe de quem é. */
      const empresa = String(a.external_reference ?? "").trim();
      if (empresa) {
        const { data: jaTem } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("mp_preapproval_id", recurso)
          .maybeSingle();

        if (!jaTem) {
          /* o plano assinado diz qual dos nossos planos é */
          const planoMp = String(a.preapproval_plan_id ?? "");
          const { data: plano } = await supabase
            .from("saas_plans")
            .select("id, mp_plan_id_monthly, mp_plan_id_annual")
            .or(`mp_plan_id_monthly.eq.${planoMp},mp_plan_id_annual.eq.${planoMp}`)
            .maybeSingle();

          await supabase
            .from("subscriptions")
            .update({
              mp_preapproval_id: recurso,
              plan_id: plano?.id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", empresa);
        }
      }
      const novo = situacao(String(a.status ?? ""));
      const vence = a.next_payment_date ? String(a.next_payment_date).slice(0, 10) : null;

      const atualizacao: Record<string, unknown> = {
        status: novo,
        mp_plan_id: a.preapproval_plan_id ?? null,
        payer_email: a.payer_email ?? null,
        charged_amount: a.auto_recurring?.transaction_amount ?? null,
        charge_period:
          a.auto_recurring?.frequency === 12 ? "annual" : "monthly",
        current_period_end: vence,
        updated_at: new Date().toISOString(),
      };
      /* no anual, o MRR é o valor do ano dividido por doze, para que a soma
         das assinaturas continue comparável entre planos */
      const valor = Number(a.auto_recurring?.transaction_amount ?? 0);
      if (valor > 0) {
        atualizacao.monthly_amount =
          a.auto_recurring?.frequency === 12 ? Number((valor / 12).toFixed(2)) : valor;
      }

      await supabase
        .from("subscriptions")
        .update(atualizacao)
        .eq("mp_preapproval_id", recurso);
    }

    if (assunto === "subscription_authorized_payment" && recurso) {
      const p = await perguntarAoMercadoPago(`/authorized_payments/${recurso}`);
      const assinatura = String(p.preapproval_id ?? "");
      const pago = String(p.status ?? "") === "processed";

      if (assinatura) {
        if (pago) {
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              last_payment_at: new Date().toISOString(),
              grace_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq("mp_preapproval_id", assinatura);
        } else {
          /* falhou: cinco dias de carência antes de virar só-leitura. Quem
             muda para read_only é a rotina diária, não este aviso — o cartão
             pode ser tentado de novo dentro do prazo. */
          const ate = new Date();
          ate.setDate(ate.getDate() + DIAS_DE_CARENCIA);
          await supabase
            .from("subscriptions")
            .update({
              status: "past_due",
              grace_until: ate.toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .eq("mp_preapproval_id", assinatura)
            .neq("status", "read_only");
        }
      }
    }

    if (registro?.id) {
      await supabase
        .from("subscription_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", registro.id);
    }
  } catch (e) {
    /* o erro fica no evento; a resposta continua 200 para o Mercado Pago não
       repetir para sempre um aviso que o nosso lado não consegue digerir */
    if (registro?.id) {
      await supabase
        .from("subscription_events")
        .update({ error: e instanceof Error ? e.message : String(e) })
        .eq("id", registro.id);
    }
  }

  return Response.json({ recebido: true }, { status: 200 });
}

/** O Mercado Pago faz um GET para conferir que o endereço existe. */
export async function GET() {
  return Response.json({ ok: true, servico: "webhook do Mercado Pago" });
}

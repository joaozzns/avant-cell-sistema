import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brl } from "@/lib/format";
import { preencher, telefoneWhatsApp, MODELOS_PADRAO } from "@/lib/mensagens";

/**
 * Fila de avisos da OS.
 *
 * Chamado depois que a OS muda de situação. Procura o modelo marcado para
 * aquela situação, escreve a mensagem com os dados reais e deixa na fila. Se a
 * loja tiver serviço de WhatsApp contratado, tenta enviar na hora.
 *
 * Nunca derruba a ação que a chamou: se o aviso falhar, a mudança de status
 * continua valendo — o atendente vê a mensagem na fila e manda na mão.
 */

type Cliente = { id: string; name: string; phone: string | null; whatsapp: string | null; consent_contact: boolean } | null;

/** Evita repetir o mesmo aviso quando a OS volta e avança de novo
 *  (reparo → teste → reparo → teste manda "pronta" uma vez só por dia). */
const JANELA_REPETICAO_H = 12;

export async function enfileirarAvisoOs(
  supabase: SupabaseClient,
  params: { osId: string; gatilho: string; companyId: string; userId: string },
): Promise<void> {
  const { osId, gatilho, companyId, userId } = params;
  try {
    /* limit(1) e não maybeSingle: se sobrou modelo duplicado de uma
       instalação antiga, o cliente ainda recebe um aviso — nunca nenhum */
    const { data: modelos } = await supabase
      .from("message_templates")
      .select("key, body, channel, active")
      .eq("company_id", companyId)
      .eq("auto_on_status", gatilho)
      .eq("active", true)
      .order("key")
      .limit(1);
    const modelo = modelos?.[0];
    if (!modelo) return;
    await montar(supabase, { osId, companyId, userId, modelo, gatilho, checarRepeticao: true });
  } catch {
    /* aviso é acessório: nunca impede a operação da loja */
  }
}

/** Aviso escrito pelo atendente a partir de um modelo (lembrete de retirada,
 *  cobrança…). Aqui não há janela de repetição: se ele pediu, é porque quer. */
export async function enfileirarAvisoPorModelo(
  supabase: SupabaseClient,
  params: { osId: string; key: string; companyId: string; userId: string },
): Promise<{ error?: string }> {
  const { osId, key, companyId, userId } = params;
  const { data: modelo } = await supabase
    .from("message_templates")
    .select("key, body, channel, active")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();
  if (!modelo) return { error: "Modelo de mensagem não encontrado." };
  return montar(supabase, { osId, companyId, userId, modelo, gatilho: null, checarRepeticao: false });
}

type Modelo = { key: string; body: string; channel: string | null };

async function montar(
  supabase: SupabaseClient,
  p: {
    osId: string; companyId: string; userId: string; modelo: Modelo;
    gatilho: string | null; checarRepeticao: boolean;
  },
): Promise<{ error?: string }> {
  const { osId, companyId, userId, modelo, gatilho, checarRepeticao } = p;

  const { data: os } = await supabase
    .from("service_orders")
    .select(`
      id, number, store_id, total, estimated_price, deadline, warranty_until, public_token,
      customers(id, name, phone, whatsapp, consent_contact),
      customer_devices(model_text),
      stores(name)
    `)
    .eq("id", osId)
    .maybeSingle();
  if (!os) return { error: "OS não encontrada." };

  const cliente = os.customers as unknown as Cliente;
  if (!cliente) return { error: "OS sem cliente identificado." };

  /* divulgação depende de autorização; aviso da própria OS, não —
     o cliente contratou o serviço e precisa saber o que houve com ele */
  const padrao = MODELOS_PADRAO.find((m) => m.key === modelo.key);
  if (padrao?.marketing && !cliente.consent_contact) {
    return { error: "Cliente não autorizou contato de divulgação (LGPD)." };
  }

  if (!telefoneWhatsApp(cliente.whatsapp ?? cliente.phone)) {
    return { error: "Cliente sem WhatsApp cadastrado." };
  }

  if (checarRepeticao) {
    const desde = new Date(Date.now() - JANELA_REPETICAO_H * 3600_000).toISOString();
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("ref_table", "service_orders")
      .eq("ref_id", osId)
      .eq("template_key", modelo.key)
      .gte("created_at", desde);
    if ((count ?? 0) > 0) return {};
  }

  /* no orçamento o valor que interessa é o da proposta enviada;
     nas demais, o total já fechado da OS */
  let valor = Number(os.total ?? 0);
  if (gatilho === "awaiting_approval" || gatilho === "approved" || modelo.key === "quote_ready") {
    const { data: orc } = await supabase
      .from("os_quotes")
      .select("total, status")
      .eq("os_id", osId)
      .in("status", ["sent", "approved", "partially_approved"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orc) valor = Number(orc.total ?? 0);
  }
  if (!valor) valor = Number(os.estimated_price ?? 0);

  const origem = await origemPublica();
  const corpo = preencher(modelo.body, {
    cliente: cliente.name,
    primeiro_nome: cliente.name.split(" ")[0],
    /* modelos antigos usam {{nome}} */
    nome: cliente.name.split(" ")[0],
    loja: (os.stores as unknown as { name?: string } | null)?.name ?? "",
    numero_os: String(os.number),
    aparelho: (os.customer_devices as unknown as { model_text?: string } | null)?.model_text ?? "aparelho",
    valor: valor > 0 ? brl(valor) : "",
    prazo: os.deadline ? new Date(os.deadline as string).toLocaleDateString("pt-BR") : "",
    garantia: os.warranty_until ? new Date(os.warranty_until as string).toLocaleDateString("pt-BR") : "",
    link: origem ? `${origem}/acompanhar/${os.public_token}` : "",
  });

  const { data: aviso, error: erroInsert } = await supabase
    .from("messages")
    .insert({
      company_id: companyId,
      store_id: os.store_id,
      customer_id: cliente.id,
      channel: modelo.channel ?? "whatsapp",
      direction: "out",
      template_key: modelo.key,
      body: corpo,
      ref_table: "service_orders",
      ref_id: osId,
      status: "queued",
      user_id: userId,
    })
    .select("id")
    .single();

  if (erroInsert) return { error: erroInsert.message };
  if (aviso) await tentarEnvioAutomatico(supabase, companyId, aviso.id as string, cliente, corpo);
  return {};
}

/** Só existe envio automático com serviço contratado. Sem ele, a mensagem fica
 *  na fila e o atendente envia pelo WhatsApp Web em um clique. */
async function tentarEnvioAutomatico(
  supabase: SupabaseClient,
  companyId: string,
  mensagemId: string,
  cliente: NonNullable<Cliente>,
  corpo: string,
) {
  const { data: integracao } = await supabase
    .from("integrations")
    .select("config")
    .eq("company_id", companyId)
    .eq("kind", "whatsapp")
    .eq("status", "connected")
    .maybeSingle();

  const cfg = (integracao?.config ?? null) as { url?: string; token?: string } | null;
  if (!cfg?.url || !cfg.token) return;

  const telefone = telefoneWhatsApp(cliente.whatsapp ?? cliente.phone);
  try {
    const res = await fetch(cfg.url.replace(/\/$/, "") + "/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: telefone, type: "text", text: { body: corpo } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`serviço respondeu ${res.status}`);
    await supabase.from("messages").update({ status: "sent" }).eq("id", mensagemId);
  } catch (e) {
    await supabase
      .from("messages")
      .update({ status: "failed", error: (e as Error).message })
      .eq("id", mensagemId);
  }
}

/** Endereço público do sistema, para montar o link de acompanhamento. */
async function origemPublica() {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return "";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { isoLocal } from "@/lib/format";
import { mensagemDoBanco } from "@/lib/erro-banco";

const CAMINHO = "/clientes/lgpd";

/** A LGPD dá 15 dias para a loja responder um pedido do titular — o prazo
 *  nasce junto com o pedido para ninguém perder a data. */
export async function abrirPedido(clienteId: string, tipo: "export" | "anonymization" | "deletion", observacao = "") {
  const { supabase, companyId } = await getSessionContext();
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + 15);

  const { error } = await supabase.from("lgpd_requests").insert({
    company_id: companyId,
    customer_id: clienteId,
    kind: tipo,
    status: "open",
    due_at: isoLocal(prazo),
    notes: observacao.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function encerrarPedido(id: string, motivo: string) {
  const { supabase, userId } = await getSessionContext();
  if (!motivo.trim()) return { error: "Diga o que foi feito ou por que o pedido foi recusado." };
  const { error } = await supabase
    .from("lgpd_requests")
    .update({ status: "rejected", completed_at: new Date().toISOString(), handled_by: userId, notes: motivo })
    .eq("id", id).eq("status", "open");
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function anonimizar(clienteId: string, pedidoId?: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("lgpd_anonymize", {
    p: { customer_id: clienteId, request_id: pedidoId ?? null },
  });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/clientes");
  return { ok: true, nomeAnterior: (data as { nome_anterior?: string })?.nome_anterior };
}

/** Tudo que a loja guarda sobre o cliente, em um arquivo só — é o que a lei
 *  chama de direito de acesso e portabilidade. */
export async function exportarDados(clienteId: string) {
  const { supabase, companyId, companyName } = await getSessionContext();

  const [cliente, aparelhos, vendas, oss, recebiveis, creditos, mensagens, pedidos] = await Promise.all([
    supabase.from("customers").select("*").eq("id", clienteId).eq("company_id", companyId).maybeSingle(),
    supabase.from("customer_devices").select("model_text, imei, serial_number, color, capacity, acquired_at, status")
      .eq("customer_id", clienteId),
    supabase.from("sales").select("number, status, subtotal, discount, total, completed_at, sale_items(qty, unit_price, total, products(name))")
      .eq("customer_id", clienteId).order("completed_at"),
    supabase.from("service_orders").select("number, status, reported_issue, total, created_at, delivered_at, warranty_until, customer_devices(model_text, imei)")
      .eq("customer_id", clienteId).order("created_at"),
    supabase.from("receivables").select("description, due_date, amount, paid_amount, status").eq("customer_id", clienteId),
    supabase.from("store_credits").select("amount, balance, origin, expires_at, created_at").eq("customer_id", clienteId),
    supabase.from("messages").select("channel, direction, body, status, created_at").eq("customer_id", clienteId).order("created_at"),
    supabase.from("lgpd_requests").select("kind, status, requested_at, due_at, completed_at, notes").eq("customer_id", clienteId),
  ]);

  if (!cliente.data) return { error: "Cliente não encontrado." };

  const dados = {
    documento: "Relatório de dados pessoais — Lei 13.709/2018 (LGPD)",
    empresa: companyName ?? null,
    gerado_em: new Date().toISOString(),
    titular: cliente.data,
    aparelhos: aparelhos.data ?? [],
    compras: vendas.data ?? [],
    ordens_de_servico: oss.data ?? [],
    crediario: recebiveis.data ?? [],
    creditos_na_loja: creditos.data ?? [],
    mensagens_enviadas: mensagens.data ?? [],
    pedidos_lgpd: pedidos.data ?? [],
  };

  return { ok: true, arquivo: JSON.stringify(dados, null, 2), nome: `dados-${clienteId.slice(0, 8)}.json` };
}

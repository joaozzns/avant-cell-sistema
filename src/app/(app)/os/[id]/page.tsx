import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { OsDetailClient } from "./os-detail-client";

export default async function OsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, userId, companyId } = await getSessionContext();

  const { data: os } = await supabase
    .from("service_orders")
    .select(`
      *, customers(id, name, phone, whatsapp),
      customer_devices(model_text, imei, color, capacity),
      technician:technician_id(id, full_name)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!os) notFound();

  const [
    { data: diagnostics },
    { data: quotes },
    { data: parts },
    { data: comments },
    { data: history },
    { data: laborLogs },
    { data: technicians },
    { data: mensagens },
    { data: modelos },
  ] = await Promise.all([
    supabase.from("os_diagnostics")
      .select("*, profiles:technician_id(full_name)")
      .eq("os_id", id).order("created_at", { ascending: false }),
    supabase.from("os_quotes")
      .select("*, os_quote_items(*)")
      .eq("os_id", id).order("version", { ascending: false }),
    supabase.from("os_parts")
      .select("*, products(name)")
      .eq("os_id", id).order("created_at"),
    supabase.from("os_comments")
      .select("*, profiles:user_id(full_name)")
      .eq("os_id", id).order("created_at", { ascending: false }),
    supabase.from("os_status_history")
      .select("*").eq("os_id", id).order("created_at", { ascending: false }),
    supabase.from("os_labor_logs")
      .select("*").eq("os_id", id).order("started_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    supabase.from("messages")
      .select("id, body, status, error, template_key, created_at")
      .eq("ref_table", "service_orders").eq("ref_id", id)
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("message_templates")
      .select("key, name").eq("company_id", companyId).eq("active", true).order("name"),
  ]);

  const nomeModelo = new Map((modelos ?? []).map((m) => [m.key as string, m.name as string]));
  const avisos = (mensagens ?? []).map((m) => ({
    id: m.id as string,
    corpo: m.body as string,
    situacao: m.status as string,
    erro: (m.error as string | null) ?? null,
    modelo: nomeModelo.get(m.template_key as string) ?? "Mensagem",
    criado: m.created_at as string,
  }));

  return (
    <OsDetailClient
      os={JSON.parse(JSON.stringify(os))}
      diagnostics={JSON.parse(JSON.stringify(diagnostics ?? []))}
      quotes={JSON.parse(JSON.stringify(quotes ?? []))}
      parts={JSON.parse(JSON.stringify(parts ?? []))}
      comments={JSON.parse(JSON.stringify(comments ?? []))}
      history={JSON.parse(JSON.stringify(history ?? []))}
      laborLogs={JSON.parse(JSON.stringify(laborLogs ?? []))}
      technicians={JSON.parse(JSON.stringify(technicians ?? []))}
      currentUserId={userId}
      companyId={companyId}
      avisos={avisos}
      modelosAviso={(modelos ?? []).map((m) => ({ key: m.key as string, name: m.name as string }))}
    />
  );
}

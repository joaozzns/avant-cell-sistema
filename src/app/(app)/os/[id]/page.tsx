import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { OsDetailClient } from "./os-detail-client";

export default async function OsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, userId } = await getSessionContext();

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
  ]);

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
    />
  );
}

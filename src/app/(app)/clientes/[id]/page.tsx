import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate, fmtDateTime } from "@/lib/format";
import { CustomerForm } from "../customer-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OS_STATUS } from "@/app/(app)/os/os-labels";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getSessionContext();

  const { data: customer } = await supabase
    .from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) notFound();

  const [{ data: sales }, { data: orders }, { data: devices }, { data: receivables }, { data: creditos }] =
    await Promise.all([
      supabase.from("sales")
        .select("id, number, total, status, created_at")
        .eq("customer_id", id).in("status", ["completed", "partially_returned"])
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("service_orders")
        .select("id, number, status, reported_issue, warranty_until, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("customer_devices")
        .select("id, model_text, imei, color, status")
        .eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("receivables")
        .select("id, description, due_date, amount, paid_amount, status")
        .eq("customer_id", id).in("status", ["open", "partial"])
        .order("due_date"),
      supabase.from("store_credits")
        .select("balance, expires_at")
        .eq("customer_id", id).gt("balance", 0),
    ]);

  const totalSpent = (sales ?? []).reduce((s, v) => s + Number(v.total), 0);
  const openDebt = (receivables ?? []).reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const saldoCredito = (creditos ?? [])
    .filter((c) => !c.expires_at || c.expires_at >= today)
    .reduce((s, c) => s + Number(c.balance), 0);
  const activeWarranty = (orders ?? []).find(
    (o) => o.warranty_until && o.warranty_until >= today && o.status === "delivered");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">
          Total gasto: {brl(totalSpent)} · {(sales ?? []).length} compras · {(orders ?? []).length} OS
          {openDebt > 0 && <span className="ml-2 font-medium text-destructive">· deve {brl(openDebt)}</span>}
          {saldoCredito > 0 && <span className="ml-2 font-medium text-green-600">· crédito na loja {brl(saldoCredito)}</span>}
        </p>
        {activeWarranty && (
          <p className="mt-1 text-sm text-green-600">
            🛡 Garantia vigente da OS #{activeWarranty.number} até {fmtDate(activeWarranty.warranty_until)}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <CustomerForm customer={customer} />

        <div className="grid content-start gap-4">
          {(receivables ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base text-destructive">Crediário em aberto</CardTitle></CardHeader>
              <CardContent className="grid gap-1.5 text-sm">
                {(receivables ?? []).map((r) => (
                  <div key={r.id} className="flex justify-between rounded border px-3 py-1.5">
                    <span>{r.description}
                      <span className={`ml-2 text-xs ${r.due_date < today ? "text-destructive" : "text-muted-foreground"}`}>
                        {fmtDate(r.due_date)}
                      </span>
                    </span>
                    <span className="font-medium">{brl(Number(r.amount) - Number(r.paid_amount))}</span>
                  </div>
                ))}
                <Link href="/financeiro/receber" className="text-xs underline underline-offset-4">
                  Receber no financeiro →
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Aparelhos</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {(devices ?? []).map((d) => (
                <div key={d.id} className="rounded border px-3 py-1.5">
                  {d.model_text}
                  {d.imei && <span className="ml-2 font-mono text-xs text-muted-foreground">{d.imei}</span>}
                </div>
              ))}
              {(devices ?? []).length === 0 && <p className="text-muted-foreground">Nenhum aparelho.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ordens de serviço</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {(orders ?? []).map((o) => (
                <Link key={o.id} href={`/os/${o.id}`}
                  className="flex items-center justify-between rounded border px-3 py-1.5 hover:border-primary">
                  <span>#{o.number} · {o.reported_issue.slice(0, 30)}…</span>
                  <Badge variant="secondary">{OS_STATUS[o.status]?.label ?? o.status}</Badge>
                </Link>
              ))}
              {(orders ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma OS.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Últimas compras</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {(sales ?? []).map((s) => (
                <Link key={s.id} href={`/pdv/vendas/${s.id}`}
                  className="flex justify-between rounded border px-3 py-1.5 hover:border-primary">
                  <span>#{s.number} · {fmtDateTime(s.created_at)}</span>
                  <span className="font-medium">{brl(s.total)}</span>
                </Link>
              ))}
              {(sales ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma compra.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

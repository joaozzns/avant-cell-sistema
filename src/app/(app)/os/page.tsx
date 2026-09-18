import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OS_STATUS, KANBAN_COLUMNS } from "./os-labels";

export default async function OsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase, storeId } = await getSessionContext();

  let query = supabase
    .from("service_orders")
    .select("id, number, status, priority, reported_issue, deadline, total, estimated_price, created_at, customers(name), customer_devices(model_text, imei), profiles:technician_id(full_name)")
    .eq("store_id", storeId)
    .not("status", "in", "(delivered,canceled)")
    .order("created_at", { ascending: true })
    .limit(200);
  const { data: allOs } = await query;

  const term = (q ?? "").toLowerCase();
  const list = (allOs ?? []).filter((o) => {
    if (!term) return true;
    const cust = (o.customers as { name?: string } | null)?.name?.toLowerCase() ?? "";
    const dev = (o.customer_devices as { model_text?: string; imei?: string } | null);
    return (
      String(o.number).includes(term) ||
      cust.includes(term) ||
      (dev?.model_text ?? "").toLowerCase().includes(term) ||
      (dev?.imei ?? "").includes(term)
    );
  });

  const { count: deliveredCount } = await supabase
    .from("service_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "delivered");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistência técnica</h1>
          <p className="text-sm text-muted-foreground">
            {list.length} OS na fila · {deliveredCount ?? 0} entregues
          </p>
        </div>
        <Link href="/os/nova" className={buttonVariants({})}>
          Abrir OS
        </Link>
      </div>

      <form className="max-w-md">
        <input
          name="q" defaultValue={q}
          placeholder="Buscar por nº, cliente, modelo ou IMEI…"
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        />
      </form>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((status) => {
          const cards = list.filter((o) => o.status === status);
          const meta = OS_STATUS[status];
          return (
            <div key={status} className="w-64 shrink-0">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.color}`} />
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="grid gap-2">
                {cards.map((o) => {
                  const overdue = o.deadline && new Date(o.deadline) < new Date();
                  const dev = o.customer_devices as { model_text?: string } | null;
                  return (
                    <Link key={o.id} href={`/os/${o.id}`}
                      className={`grid gap-1 rounded-lg border bg-background p-3 text-sm transition-colors hover:border-primary ${overdue ? "border-destructive" : ""}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-semibold">#{o.number}</span>
                        {o.priority === "urgent" && (
                          <Badge variant="destructive">urgente</Badge>
                        )}
                      </div>
                      <span className="truncate">{(o.customers as { name?: string } | null)?.name}</span>
                      <span className="truncate text-muted-foreground">{dev?.model_text}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{o.reported_issue}</span>
                      <div className="flex items-center justify-between text-xs">
                        <span className={overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>
                          {o.deadline ? `prazo ${fmtDate(o.deadline)}` : ""}
                        </span>
                        <span className="font-medium">
                          {Number(o.total) > 0 ? brl(o.total) : o.estimated_price ? `~${brl(o.estimated_price)}` : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    vazio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

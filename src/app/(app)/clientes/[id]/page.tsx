import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { CustomerForm } from "../customer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const { data: sales } = await supabase
    .from("sales")
    .select("id, number, total, status, created_at")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CustomerForm customer={customer} />
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Últimas compras</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {(sales ?? []).map((s) => (
              <div key={s.id} className="flex justify-between rounded border px-3 py-2">
                <span>#{s.number} · {fmtDateTime(s.created_at)}</span>
                <span className="font-medium">{brl(s.total)}</span>
              </div>
            ))}
            {(sales ?? []).length === 0 && (
              <p className="text-muted-foreground">Nenhuma compra ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

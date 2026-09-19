import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IssueInvoiceButton } from "./issue-invoice";

const KIND_LABEL: Record<string, string> = {
  cash: "Dinheiro", pix: "Pix", debit: "Débito",
  credit: "Crédito à vista", credit_installments: "Crédito parcelado", credit_plan: "Crediário",
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getSessionContext();

  const { data: sale } = await supabase
    .from("sales")
    .select(`
      id, number, status, subtotal, discount, total, notes, created_at, completed_at, fiscal_doc_id,
      fiscal_documents:fiscal_doc_id(kind, status, number, series, access_key, environment),
      customers(name, cpf_cnpj),
      profiles:seller_id(full_name),
      sale_items(id, qty, unit_price, discount, total, products(name), serialized_units(imei1)),
      sale_payments(id, kind, amount, installments, change_given)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();

  const customer = sale.customers as { name?: string; cpf_cnpj?: string } | null;

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Venda #{sale.number}</h1>
        <Badge variant={sale.status === "completed" ? "default" : "destructive"}>
          {sale.status === "completed" ? "concluída" : sale.status}
        </Badge>
        <a href={`/imprimir/venda/${sale.id}`} target="_blank" rel="noreferrer"
          className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          🖨️ Imprimir recibo
        </a>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p><span className="text-muted-foreground">Data:</span> {fmtDateTime(sale.created_at)}</p>
          <p><span className="text-muted-foreground">Cliente:</span> {customer?.name ?? "Balcão"}
            {customer?.cpf_cnpj && ` · ${customer.cpf_cnpj}`}</p>
          <p><span className="text-muted-foreground">Vendedor:</span> {(sale.profiles as { full_name?: string } | null)?.full_name ?? "—"}</p>
          {sale.notes && <p><span className="text-muted-foreground">Obs.:</span> {sale.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {(sale.sale_items as Array<Record<string, unknown>>).map((i) => {
                const prod = i.products as { name?: string } | null;
                const unit = i.serialized_units as { imei1?: string } | null;
                return (
                  <tr key={String(i.id)} className="border-b last:border-0">
                    <td className="py-2">
                      {prod?.name}
                      {unit?.imei1 && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          IMEI {unit.imei1}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-center text-muted-foreground">{String(i.qty)}×</td>
                    <td className="py-2 text-right text-muted-foreground">{brl(Number(i.unit_price))}</td>
                    <td className="py-2 text-right font-medium">{brl(Number(i.total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 grid gap-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{brl(sale.subtotal)}</span>
            </div>
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Desconto</span><span>−{brl(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span><span>{brl(sale.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Fiscal</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {sale.fiscal_documents ? (() => {
            const fd = sale.fiscal_documents as unknown as {
              kind: string; status: string; number: number | null;
              series: string | null; access_key: string | null; environment: string;
            };
            return (
              <div className="grid gap-1">
                <p>
                  <span className="uppercase">{fd.kind}</span> nº {fd.number}/{fd.series} ·{" "}
                  <Badge variant={fd.status === "authorized" ? "default" : fd.status === "rejected" ? "destructive" : "secondary"}>
                    {fd.status === "authorized" ? "autorizada" : fd.status}
                  </Badge>
                  {fd.environment !== "production" && (
                    <Badge variant="outline" className="ml-2">homologação</Badge>
                  )}
                </p>
                {fd.access_key && (
                  <p className="font-mono text-xs text-muted-foreground">chave: {fd.access_key}</p>
                )}
              </div>
            );
          })() : sale.status === "completed" ? (
            <IssueInvoiceButton saleId={sale.id} />
          ) : (
            <p className="text-muted-foreground">Venda não faturável.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pagamentos</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {(sale.sale_payments as Array<Record<string, unknown>>).map((p) => (
            <div key={String(p.id)} className="flex justify-between rounded border px-3 py-1.5">
              <span>
                {KIND_LABEL[String(p.kind)] ?? String(p.kind)}
                {Number(p.installments) > 1 && ` ${p.installments}x`}
                {Number(p.change_given) > 0 && (
                  <span className="ml-2 text-muted-foreground">troco {brl(Number(p.change_given))}</span>
                )}
              </span>
              <span className="font-medium">{brl(Number(p.amount))}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

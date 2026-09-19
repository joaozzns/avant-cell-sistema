import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IssueInvoiceButton } from "./issue-invoice";

const SITUACAO: Record<string, string> = {
  completed: "concluída", canceled: "cancelada", returned: "devolvida",
  partially_returned: "devolvida em parte", open: "aberta", held: "em espera",
};
const MOTIVO: Record<string, string> = {
  regret: "Arrependimento", defect: "Defeito", wrong_item: "Produto errado", warranty: "Garantia",
};
const REEMBOLSO: Record<string, string> = {
  store_credit: "crédito na loja", cash: "dinheiro", pix: "Pix", credit: "estorno no cartão", debit: "estorno no débito",
};
const DESTINO: Record<string, string> = {
  stock: "voltou ao estoque", damage: "avariado", supplier_warranty: "garantia do fornecedor", os: "assistência",
};

const KIND_LABEL: Record<string, string> = {
  cash: "Dinheiro", pix: "Pix", debit: "Débito",
  credit: "Crédito à vista", credit_installments: "Crédito parcelado", credit_plan: "Crediário", store_credit: "Crédito na loja",
};

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ devolucao?: string }>;
}) {
  const { id } = await params;
  const { devolucao } = await searchParams;
  const { supabase } = await getSessionContext();

  const { data: sale } = await supabase
    .from("sales")
    .select(`
      id, number, status, subtotal, discount, total, notes, created_at, completed_at, fiscal_doc_id,
      fiscal_documents:fiscal_doc_id(kind, status, number, series, access_key, environment),
      customers(name, cpf_cnpj),
      profiles:seller_id(full_name),
      sale_items(id, qty, returned_qty, unit_price, discount, total, products(name), serialized_units(imei1)),
      sale_payments(id, kind, amount, installments, change_given)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();

  const { data: devolucoes } = await supabase
    .from("sale_returns")
    .select("id, reason, refund_kind, total, notes, created_at, profiles:created_by(full_name), sale_return_items(qty, destination, sale_items(products(name)))")
    .eq("sale_id", id)
    .order("created_at", { ascending: false });
  const podeDevolver = ["completed", "partially_returned"].includes(sale.status);

  const customer = sale.customers as { name?: string; cpf_cnpj?: string } | null;

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Venda #{sale.number}</h1>
        <Badge variant={sale.status === "completed" ? "default" : sale.status === "partially_returned" ? "secondary" : "destructive"}>
          {SITUACAO[sale.status] ?? sale.status}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {podeDevolver && (
            <Link href={`/pdv/vendas/${sale.id}/devolver`}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              ↩️ Devolver / trocar
            </Link>
          )}
          <a href={`/imprimir/venda/${sale.id}`} target="_blank" rel="noreferrer"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            🖨️ Imprimir recibo
          </a>
        </div>
      </div>

      {devolucao === "ok" && (
        <div className="rounded-lg border border-green-600/30 bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
          Devolução registrada. O estoque e o reembolso já foram atualizados.
        </div>
      )}

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
                    <td className="py-2 text-center text-muted-foreground">
                      {String(i.qty)}×
                      {Number(i.returned_qty ?? 0) > 0 && (
                        <span className="block text-xs text-destructive">{String(i.returned_qty)} devolvido</span>
                      )}
                    </td>
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

      {devolucoes && devolucoes.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Devoluções</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {devolucoes.map((d) => {
              const itensDev = (d.sale_return_items ?? []) as unknown as Array<{
                qty: number; destination: string; sale_items: { products: { name?: string } | null } | null;
              }>;
              return (
                <div key={d.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {MOTIVO[d.reason] ?? d.reason} · {REEMBOLSO[d.refund_kind] ?? d.refund_kind}
                    </span>
                    <span className="font-semibold">{brl(d.total)}</span>
                  </div>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {itensDev.map((x, k) => (
                      <li key={k}>
                        {Number(x.qty)}× {x.sale_items?.products?.name ?? "Item"} → {DESTINO[x.destination] ?? x.destination}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtDateTime(d.created_at)}
                    {(d.profiles as { full_name?: string } | null)?.full_name && ` · por ${(d.profiles as { full_name?: string }).full_name}`}
                    {d.notes && ` · ${d.notes}`}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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

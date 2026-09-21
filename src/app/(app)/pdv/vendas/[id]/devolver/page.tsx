import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { FormDevolucao, type ItemVendido } from "./form";

export default async function DevolverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSessionContext();

  const { data: venda } = await supabase
    .from("sales")
    .select(`
      id, number, status, total, customer_id,
      customers(name),
      sale_payments(kind, amount, change_given),
      sale_returns(total, refund_kind),
      sale_items(id, qty, returned_qty, unit_price, total, products(name), serialized_units(imei1))
    `)
    .eq("id", id)
    .maybeSingle();
  if (!venda) notFound();
  if (!["completed", "partially_returned"].includes(venda.status)) redirect(`/pdv/vendas/${id}`);

  const itens: ItemVendido[] = (venda.sale_items ?? []).map((i) => {
    const it = i as unknown as {
      id: string; qty: number; returned_qty: number | null; total: number;
      products: { name?: string } | null; serialized_units: { imei1?: string } | null;
    };
    return {
      id: it.id,
      nome: it.products?.name ?? "Item",
      imei: it.serialized_units?.imei1 ?? null,
      qtd: Number(it.qty),
      devolvido: Number(it.returned_qty ?? 0),
      valorUnitario: Number(it.total) / Number(it.qty),
    };
  });

  /* o que foi pago com crédito na loja não pode voltar como dinheiro */
  const pagamentos = (venda.sale_payments ?? []) as unknown as { kind: string; amount: number; change_given: number | null }[];
  const devolucoes = (venda.sale_returns ?? []) as unknown as { total: number; refund_kind: string }[];
  const emDinheiro = pagamentos
    .filter((p) => !["store_credit", "voucher"].includes(p.kind))
    .reduce((s, p) => s + Number(p.amount) - Number(p.change_given ?? 0), 0);
  const jaDevolvido = devolucoes
    .filter((d) => !["store_credit", "voucher"].includes(d.refund_kind))
    .reduce((s, d) => s + Number(d.total), 0);

  return (
    <FormDevolucao
      limiteDinheiro={Math.max(emDinheiro - jaDevolvido, 0)}
      vendaId={venda.id}
      numero={venda.number}
      cliente={(venda.customers as { name?: string } | null)?.name ?? null}
      itens={itens}
    />
  );
}

import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { Contagem, type ItemContagem } from "./contagem";

export default async function InventarioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSessionContext();

  const { data: inv } = await supabase
    .from("inventories")
    .select("id, status, blind, scope, created_at, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();

  const { data: itens } = await supabase
    .from("inventory_items")
    .select("id, system_qty, counted_qty, second_count, final_qty, diff_value, products(name, sku)")
    .eq("inventory_id", id)
    .limit(500);

  const lista: ItemContagem[] = (itens ?? []).map((i) => {
    const it = i as unknown as {
      id: string; system_qty: number; counted_qty: number | null; second_count: number | null;
      final_qty: number | null; diff_value: number | null; products: { name?: string; sku?: string } | null;
    };
    return {
      id: it.id,
      nome: it.products?.name ?? "Produto",
      codigo: it.products?.sku ?? null,
      sistema: Number(it.system_qty),
      contado: it.counted_qty === null ? null : Number(it.counted_qty),
      segunda: it.second_count === null ? null : Number(it.second_count),
      final: it.final_qty === null ? null : Number(it.final_qty),
      impacto: it.diff_value === null ? null : Number(it.diff_value),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <Contagem
      id={inv.id}
      situacao={inv.status}
      cego={inv.blind}
      fechado={inv.status === "closed"}
      itens={lista}
    />
  );
}

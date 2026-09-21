import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { DetalheTransferencia, type ItemDetalhe } from "./detalhe";

export default async function TransferenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, storeId } = await getSessionContext();

  const { data: t } = await supabase
    .from("transfers")
    .select(`
      id, status, notes, created_at, sent_at, received_at, from_store, to_store,
      transfer_items(id, qty, qty_received, divergence, unit_id,
        products(name), serialized_units(imei1, color, capacity))
    `)
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const { data: lojas } = await supabase.from("stores").select("id, name");
  const nome = (loja: string) => lojas?.find((l) => l.id === loja)?.name ?? "—";

  const itens: ItemDetalhe[] = (t.transfer_items ?? []).map((i) => {
    const it = i as unknown as {
      id: string; qty: number; qty_received: number | null; divergence: string | null; unit_id: string | null;
      products: { name?: string } | null; serialized_units: { imei1?: string; color?: string; capacity?: string } | null;
    };
    return {
      id: it.id,
      nome: it.products?.name ?? "Item",
      imei: it.serialized_units?.imei1 ?? null,
      detalhe: [it.serialized_units?.color, it.serialized_units?.capacity].filter(Boolean).join(" · "),
      qtd: Number(it.qty),
      recebido: it.qty_received === null ? null : Number(it.qty_received),
      divergencia: it.divergence,
      comImei: !!it.unit_id,
    };
  });

  return (
    <DetalheTransferencia
      id={t.id}
      situacao={t.status}
      origem={nome(t.from_store)}
      destino={nome(t.to_store)}
      obs={t.notes}
      criadaEm={t.created_at}
      enviadaEm={t.sent_at}
      recebidaEm={t.received_at}
      itens={itens}
      souOrigem={t.from_store === storeId}
      souDestino={t.to_store === storeId}
    />
  );
}

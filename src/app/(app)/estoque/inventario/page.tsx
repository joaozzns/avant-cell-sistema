import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NovoInventario } from "./novo";

const SITUACAO: Record<string, string> = {
  open: "aberto", counting: "em contagem", review: "em conferência",
  closed: "fechado", canceled: "cancelado",
};

export default async function InventarioPage() {
  const { supabase, storeId } = await getSessionContext();

  const [{ data: lista }, { data: categorias }] = await Promise.all([
    supabase.from("inventories")
      .select("id, status, scope, blind, created_at, closed_at, inventory_items(id)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const emAndamento = (lista ?? []).find((i) => ["open", "counting", "review"].includes(i.status));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventário</h1>
        <p className="text-sm text-muted-foreground">
          Contagem cega: quem conta digita o que achou na prateleira sem ver o saldo do sistema.
          No fechamento, cada diferença vira ajuste com o valor do impacto.
        </p>
      </div>

      {emAndamento ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <span className="text-sm">
              Há um inventário <strong>{SITUACAO[emAndamento.status]}</strong> com{" "}
              {(emAndamento.inventory_items ?? []).length} item(ns).
            </span>
            <Link href={`/estoque/inventario/${emAndamento.id}`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Continuar contagem
            </Link>
          </CardContent>
        </Card>
      ) : (
        <NovoInventario categorias={categorias ?? []} />
      )}

      <Card>
        <CardContent className="grid gap-2 py-4">
          {(lista ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum inventário ainda.</p>}
          {(lista ?? []).map((i) => {
            const escopo = (i.scope ?? {}) as { tipo?: string };
            return (
              <Link key={i.id} href={`/estoque/inventario/${i.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                <span>
                  {escopo.tipo === "categoria" ? "Por categoria" : "Loja inteira"}
                  <span className="block text-xs text-muted-foreground">
                    {(i.inventory_items ?? []).length} itens · aberto em {fmtDateTime(i.created_at)}
                    {i.closed_at && ` · fechado em ${fmtDateTime(i.closed_at)}`}
                  </span>
                </span>
                <Badge variant={i.status === "closed" ? "default" : "secondary"}>{SITUACAO[i.status] ?? i.status}</Badge>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const SITUACAO: Record<string, { rotulo: string; cor: "default" | "secondary" | "destructive" | "outline" }> = {
  separating: { rotulo: "separando", cor: "outline" },
  sent: { rotulo: "enviada", cor: "secondary" },
  in_transit: { rotulo: "em trânsito", cor: "secondary" },
  received: { rotulo: "recebida", cor: "default" },
  divergent: { rotulo: "com divergência", cor: "destructive" },
  canceled: { rotulo: "cancelada", cor: "destructive" },
};

export default async function TransferenciasPage() {
  const { supabase, storeId } = await getSessionContext();

  const { data: lista } = await supabase
    .from("transfers")
    .select("id, status, notes, created_at, sent_at, received_at, from_store, to_store, transfer_items(id)")
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: lojas } = await supabase.from("stores").select("id, name");
  const nome = (id: string) => lojas?.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transferências entre lojas</h1>
          <p className="text-sm text-muted-foreground">
            O estoque sai da origem no envio e só entra no destino quando alguém confere o que chegou.
          </p>
        </div>
        <Link href="/estoque/transferencias/nova"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          + Nova transferência
        </Link>
      </div>

      <Card>
        <CardContent className="grid gap-2 py-4">
          {(lista ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma transferência ainda.</p>
          )}
          {(lista ?? []).map((t) => {
            const s = SITUACAO[t.status] ?? { rotulo: t.status, cor: "outline" as const };
            const chegando = t.to_store === storeId && ["in_transit", "sent"].includes(t.status);
            return (
              <Link key={t.id} href={`/estoque/transferencias/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                <span>
                  <strong>{nome(t.from_store)}</strong> → <strong>{nome(t.to_store)}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {(t.transfer_items ?? []).length} item(ns) · criada em {fmtDateTime(t.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {chegando && <Badge variant="outline">chegando aqui</Badge>}
                  <Badge variant={s.cor}>{s.rotulo}</Badge>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { UnitForm } from "./unit-form";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  available: { label: "Disponível", variant: "default" },
  reserved: { label: "Reservado", variant: "secondary" },
  sold: { label: "Vendido", variant: "outline" },
  in_service: { label: "Em OS", variant: "secondary" },
  returned: { label: "Devolvido", variant: "secondary" },
  damaged: { label: "Avariado", variant: "destructive" },
  blocked: { label: "Bloqueado", variant: "destructive" },
  in_transit: { label: "Em trânsito", variant: "secondary" },
};

export default async function UnitsPage() {
  const { supabase } = await getSessionContext();

  const [{ data: units }, { data: deviceProducts }] = await Promise.all([
    supabase
      .from("serialized_units")
      .select("id, imei1, color, capacity, condition, status, cost, sale_price, created_at, products(name), stores(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("id, name")
      .eq("serialized", true)
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aparelhos com IMEI</h1>
        <p className="text-sm text-muted-foreground">
          Cada aparelho é uma unidade única e rastreável. O IMEI é validado
          (dígito verificador) e não pode se repetir na empresa.
        </p>
      </div>

      {(deviceProducts ?? []).length === 0 ? (
        <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          Para dar entrada em aparelhos, primeiro cadastre um produto do tipo
          <strong> Aparelho</strong> com “Controlar por IMEI” marcado.
        </p>
      ) : (
        <UnitForm products={deviceProducts ?? []} />
      )}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IMEI</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead>Entrada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(units ?? []).map((u) => {
              const st = STATUS_LABEL[u.status] ?? { label: u.status, variant: "outline" as const };
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-sm">{u.imei1}</TableCell>
                  <TableCell>{(u.products as { name?: string } | null)?.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[u.color, u.capacity].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(u.stores as { name?: string } | null)?.name}
                  </TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right text-muted-foreground">{brl(u.cost)}</TableCell>
                  <TableCell className="text-right">{brl(u.sale_price)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                </TableRow>
              );
            })}
            {(units ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhum aparelho registrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

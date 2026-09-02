import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const TYPE_LABEL: Record<string, string> = {
  device: "Aparelho",
  accessory: "Acessório",
  part: "Peça",
  service: "Serviço",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase, storeId } = await getSessionContext();

  let query = supabase
    .from("products")
    .select("id, name, type, internal_code, ean, cost, sale_price, min_price, serialized, active, stock_items(store_id, qty, min_qty)")
    .order("name")
    .limit(100);
  if (q) {
    query = query.or(`name.ilike.%${q}%,internal_code.ilike.%${q}%,ean.ilike.%${q}%`);
  }
  const { data: products } = await query;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo e estoque</h1>
          <p className="text-sm text-muted-foreground">
            {products?.length ?? 0} produtos · saldo da loja ativa
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/estoque/categorias" className={buttonVariants({ variant: "outline" })}>
            Categorias e marcas
          </Link>
          <Link href="/estoque/aparelhos" className={buttonVariants({ variant: "outline" })}>
            Aparelhos (IMEI)
          </Link>
          <Link href="/estoque/movimentacoes" className={buttonVariants({ variant: "outline" })}>
            Movimentações
          </Link>
          <Link href="/estoque/novo" className={buttonVariants({})}>
            Novo produto
          </Link>
        </div>
      </div>

      <form className="flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, código ou EAN…" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Código</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(products ?? []).map((p) => {
              const stock = (p.stock_items as { store_id: string; qty: number; min_qty: number }[])
                .find((s) => s.store_id === storeId);
              const qty = Number(stock?.qty ?? 0);
              const low = stock && qty <= Number(stock.min_qty ?? 0);
              return (
                <TableRow key={p.id} className={!p.active ? "opacity-50" : ""}>
                  <TableCell>
                    <Link href={`/estoque/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <Badge variant="outline" className="ml-2">inativo</Badge>}
                  </TableCell>
                  <TableCell>
                    {TYPE_LABEL[p.type]}
                    {p.serialized && <Badge variant="secondary" className="ml-2">IMEI</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.internal_code ?? p.ean ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{brl(p.cost)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(p.sale_price)}</TableCell>
                  <TableCell className="text-right">
                    {p.type === "service" ? "—" : p.serialized ? (
                      <span className="text-muted-foreground">unitário</span>
                    ) : (
                      <span className={low ? "font-semibold text-destructive" : ""}>
                        {qty}
                        {low && " ⚠"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/estoque/${p.id}`} className="text-sm underline-offset-4 hover:underline">
                      editar
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {(products ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhum produto ainda.{" "}
                  <Link href="/estoque/novo" className="underline">Cadastre o primeiro</Link>.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

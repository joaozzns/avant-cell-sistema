import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { lerCategorias, categoriasDoTipo, type TipoCategoria } from "@/lib/categorias";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveCategory } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const TEXTOS: Record<TipoCategoria, { rota: string; novo: string; vazio: string; exemplo: string; produto: string }> = {
  accessory: {
    rota: "/estoque/acessorios", novo: "Novo acessório", produto: "Acessório",
    vazio: "Nenhum acessório cadastrado.", exemplo: "Ex.: Capinhas, Películas, Carregadores",
  },
  device: {
    rota: "/estoque/aparelhos", novo: "Novo modelo", produto: "Modelo",
    vazio: "Nenhum modelo de aparelho cadastrado.", exemplo: "Ex.: iPhone, Samsung, Seminovos",
  },
};

/* Acessórios e Aparelhos são a mesma tela com filtro diferente: categorias
 * daquele tipo no alto, e a lista de produtos do tipo, filtrável por
 * categoria, embaixo. */
export async function ProdutosPorTipo({ tipo, categoria }: { tipo: TipoCategoria; categoria?: string }) {
  const { supabase, storeId } = await getSessionContext();
  const t = TEXTOS[tipo];

  let consulta = supabase
    .from("products")
    .select("id, name, category_id, internal_code, ean, cost, sale_price, serialized, active, stock_items(store_id, qty, min_qty)")
    .eq("type", tipo)
    .order("name")
    .limit(200);
  if (categoria) consulta = consulta.eq("category_id", categoria);

  const [todas, { data: produtos }, { data: contagem }] = await Promise.all([
    lerCategorias(supabase),
    consulta,
    supabase.from("products").select("category_id").eq("type", tipo),
  ]);
  const categorias = categoriasDoTipo(todas, tipo).filter((c) => c.active);
  const porCategoria = new Map<string, number>();
  for (const p of contagem ?? []) {
    if (p.category_id) porCategoria.set(p.category_id, (porCategoria.get(p.category_id) ?? 0) + 1);
  }
  const nomeCategoria = new Map(todas.map((c) => [c.id, c.name]));
  const filtro = "rounded-full border px-3 py-1 text-sm transition-colors hover:border-ring";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
          <CardDescription>Clique numa categoria para ver só os produtos dela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Link href={t.rota} className={cn(filtro, !categoria && "border-primary bg-primary text-primary-foreground")}>
              Todas
            </Link>
            {categorias.map((c) => (
              <Link key={c.id} href={`${t.rota}?categoria=${c.id}`}
                className={cn(filtro, categoria === c.id && "border-primary bg-primary text-primary-foreground")}>
                {c.name}
                <span className="ml-1.5 opacity-70">{porCategoria.get(c.id) ?? 0}</span>
              </Link>
            ))}
          </div>
          <form action={saveCategory} className="flex max-w-md flex-wrap gap-2">
            <input type="hidden" name="kind" value={tipo} />
            <Input name="name" placeholder={`Nova categoria · ${t.exemplo}`} required maxLength={60} className="min-w-0 flex-1" />
            <Button type="submit" variant="secondary">Criar categoria</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {produtos?.length ?? 0} {tipo === "device" ? "modelos" : "acessórios"}
            {categoria && nomeCategoria.get(categoria) && ` em ${nomeCategoria.get(categoria)}`}
          </p>
          <Link href={`/estoque/novo?tipo=${tipo}`} className={buttonVariants({})}>{t.novo}</Link>
        </div>
        <div className="min-w-0 rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.produto}</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(produtos ?? []).map((p) => {
                const saldo = (p.stock_items as { store_id: string; qty: number; min_qty: number }[])
                  .find((s) => s.store_id === storeId);
                const qtd = Number(saldo?.qty ?? 0);
                const baixo = saldo && qtd <= Number(saldo.min_qty ?? 0);
                return (
                  <TableRow key={p.id} className={!p.active ? "opacity-50" : ""}>
                    <TableCell>
                      <Link href={`/estoque/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      {!p.active && <Badge variant="outline" className="ml-2">inativo</Badge>}
                      {p.serialized && <Badge variant="secondary" className="ml-2">IMEI</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(p.category_id && nomeCategoria.get(p.category_id)) || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.internal_code ?? p.ean ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{brl(p.cost)}</TableCell>
                    <TableCell className="text-right font-medium">{brl(p.sale_price)}</TableCell>
                    <TableCell className="text-right">
                      {p.serialized ? (
                        <span className="text-muted-foreground">por IMEI</span>
                      ) : (
                        <span className={baixo ? "font-semibold text-destructive" : ""}>{qtd}{baixo && " ⚠"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(produtos ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {categoria ? "Nenhum produto nesta categoria." : t.vazio}{" "}
                    <Link href={`/estoque/novo?tipo=${tipo}`} className="underline">{t.novo}</Link>.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

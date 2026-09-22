import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, isoLocal } from "@/lib/format";
import { Atalho, Indicador } from "@/components/painel";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart, Users, Package, Wrench, Wallet, FileText, Boxes,
  CalendarClock, Cake, TriangleAlert, Info, BellRing, CircleDollarSign,
  Settings, ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const { supabase, storeId, storeName } = await getSessionContext();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = isoLocal(hoje);
  const em7dias = new Date();
  em7dias.setDate(em7dias.getDate() + 7);

  const [
    { data: vendasHoje },
    { count: osAbertas },
    { data: aReceber },
    { data: estoqueBaixo },
    { count: pagarHoje },
    { count: osAtrasadas },
    { data: aniversariantes },
  ] = await Promise.all([
    supabase
      .from("sales").select("total")
      .eq("store_id", storeId).eq("status", "completed")
      .gte("created_at", hoje.toISOString()),
    supabase
      .from("service_orders").select("id", { count: "exact", head: true })
      .eq("store_id", storeId).not("status", "in", "(delivered,canceled)"),
    supabase
      .from("receivables").select("amount, paid_amount")
      .eq("store_id", storeId).in("status", ["open", "partial"])
      .lte("due_date", isoLocal(em7dias)),
    supabase
      .from("stock_items").select("qty, min_qty, products(name)")
      .eq("store_id", storeId).gt("min_qty", 0),
    supabase
      .from("payables").select("id", { count: "exact", head: true })
      .eq("store_id", storeId).in("status", ["open", "partial"])
      .lte("due_date", hojeISO),
    supabase
      .from("service_orders").select("id", { count: "exact", head: true })
      .eq("store_id", storeId).not("status", "in", "(delivered,canceled)")
      .lt("deadline", new Date().toISOString()),
    /* aniversario nao da para filtrar por mes/dia no PostgREST sem funcao no
       banco, entao trazemos so a coluna e comparamos aqui. */
    supabase
      .from("customers").select("id, birthdate")
      .not("birthdate", "is", null).eq("active", true).limit(4000),
  ]);

  const faturamento = (vendasHoje ?? []).reduce((s, v) => s + Number(v.total), 0);
  const receber = (aReceber ?? []).reduce(
    (s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const baixos = (estoqueBaixo ?? []).filter((s) => Number(s.qty) <= Number(s.min_qty));
  const mesDia = `${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const fazemAniversario = (aniversariantes ?? []).filter(
    (c) => typeof c.birthdate === "string" && c.birthdate.slice(5) === mesDia
  ).length;

  const avisos = [
    pagarHoje ? { texto: `${pagarHoje} conta(s) a pagar vencendo hoje ou vencida(s)`, href: "/financeiro/pagar" } : null,
    osAtrasadas ? { texto: `${osAtrasadas} OS com prazo de entrega vencido`, href: "/os" } : null,
    baixos.length ? { texto: `${baixos.length} item(ns) com estoque abaixo do mínimo`, href: "/estoque" } : null,
  ].filter(Boolean) as { texto: string; href: string }[];

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* coluna principal */}
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Atalhos</CardTitle>
              <CardAction>
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configurar
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-5">
              <Atalho href="/pdv" tom="primario" icone={ShoppingCart}>Nova venda</Atalho>
              <Atalho href="/clientes" icone={Users}>Clientes</Atalho>
              <Atalho href="/estoque" icone={Package}>Estoque</Atalho>
              <Atalho href="/os/nova" icone={Wrench}>Ordem de serviço</Atalho>
              <Atalho href="/pdv/caixa" icone={CircleDollarSign}>Abrir / fechar caixa</Atalho>
              {fazemAniversario > 0 && (
                <Atalho href="/clientes" tom="aviso" icone={Cake}>
                  {fazemAniversario} aniversariante(s) hoje
                </Atalho>
              )}
              {Boolean(pagarHoje) && (
                <Atalho href="/financeiro/pagar" tom="alerta" icone={TriangleAlert}>
                  {pagarHoje} conta(s) a pagar vencendo
                </Atalho>
              )}
              {Boolean(osAtrasadas) && (
                <Atalho href="/os" tom="alerta" icone={CalendarClock}>
                  {osAtrasadas} OS com prazo vencido
                </Atalho>
              )}
              <Atalho href="/estoque/aparelhos" icone={Boxes}>Entrada de aparelho</Atalho>
              <Atalho href="/compras" icone={Package}>Compras</Atalho>
              <Atalho href="/financeiro" icone={Wallet}>Financeiro</Atalho>
              <Atalho href="/fiscal" icone={FileText}>Fiscal</Atalho>
              <Atalho href="/pdv/vendas" icone={ShoppingCart}>Vendas — PDV</Atalho>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Central de avisos</CardTitle>
              <CardAction>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BellRing className="h-3.5 w-3.5" />
                  {avisos.length} aviso(s)
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2 pt-5">
              {avisos.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-primary">
                  <Info className="h-4 w-4 shrink-0" />
                  Não há notificações.
                </div>
              ) : (
                avisos.map((a) => (
                  <Link
                    key={a.texto}
                    href={a.href}
                    className="group flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive transition-colors hover:bg-destructive/15"
                  >
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">{a.texto}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Dashboard diário</CardTitle>
              <p className="text-xs text-muted-foreground">
                {storeName} · {hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { rotulo: "Faturamento do dia", valor: brl(faturamento), href: "/pdv/vendas" },
                { rotulo: "Vendas hoje", valor: String((vendasHoje ?? []).length), href: "/pdv/vendas" },
                { rotulo: "OS abertas", valor: String(osAbertas ?? 0), href: "/os" },
                { rotulo: "A receber (7 dias)", valor: brl(receber), href: "/financeiro/receber" },
              ].map((k) => (
                <Link
                  key={k.rotulo}
                  href={k.href}
                  className="rounded-xl border bg-background p-4 transition-colors hover:border-primary"
                >
                  <p className="text-xs text-muted-foreground">{k.rotulo}</p>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight">{k.valor}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* coluna de indicadores */}
        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Indicador
            valor={osAbertas ?? 0}
            rotulo="Ordens de serviço em aberto"
            href="/os"
            icone={Wrench}
          />
          <Indicador
            valor={baixos.length}
            rotulo="Estoque abaixo do mínimo"
            href="/estoque"
            icone={Package}
            tom="acento"
          />
          <Indicador
            valor={brl(receber)}
            rotulo="A receber nos próximos 7 dias"
            href="/financeiro/receber"
            icone={Wallet}
            tom="sucesso"
          />

          {baixos.length > 0 && (
            <Card className="sm:col-span-2 xl:col-span-1">
              <CardHeader className="border-b py-4">
                <CardTitle className="text-base">Repor no estoque</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5 pt-4 text-sm">
                {baixos.slice(0, 6).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      {(s.products as { name?: string } | null)?.name ?? "Produto"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-destructive">
                      {Number(s.qty)} / mín. {Number(s.min_qty)}
                    </span>
                  </div>
                ))}
                {baixos.length > 6 && (
                  <Link
                    href="/estoque"
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    ver os outros {baixos.length - 6}
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

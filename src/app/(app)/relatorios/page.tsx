import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTS = [
  { href: "/relatorios/vendas", title: "Vendas", desc: "Faturamento por dia, forma de pagamento, ranking de produtos e vendedores" },
  { href: "/relatorios/assistencia", title: "Assistência", desc: "Volume de OS, tempo médio, produtividade por técnico e margem" },
  { href: "/relatorios/estoque", title: "Estoque", desc: "Posição valorizada, itens parados e mais vendidos" },
  { href: "/financeiro/dre", title: "DRE gerencial", desc: "Resultado do mês separando loja e assistência" },
  { href: "/financeiro", title: "Fluxo de caixa", desc: "Entradas x saídas previstas por semana" },
  { href: "/admin/auditoria", title: "Auditoria", desc: "Quem fez o quê, quando e de onde (admin)" },
];

export default function ReportsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Todos com filtro por período e exportação CSV.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription>{r.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .single();

  const kpis = [
    { label: "Faturamento do dia", value: "R$ 0,00" },
    { label: "Vendas hoje", value: "0" },
    { label: "OS abertas", value: "0" },
    { label: "A receber (7 dias)", value: "R$ 0,00" },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {company?.name ?? "Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da operação — os números passam a contar a partir da
          primeira venda (Fase 1).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fase 0 concluída</CardTitle>
          <CardDescription>O que já está pronto nesta fundação</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>✔ Banco de dados completo: 84 tabelas cobrindo os 12 módulos</p>
          <p>✔ Multi-loja com Row Level Security por unidade (store_id)</p>
          <p>✔ Autenticação, perfis e matriz de permissões por ação</p>
          <p>✔ Log de auditoria automático nas operações sensíveis</p>
          <p>✔ Numeração sequencial por loja (venda, OS, orçamento, pedido)</p>
          <p>✔ Validação de IMEI (Luhn) e unicidade em toda a empresa</p>
          <p className="pt-2 text-muted-foreground">
            Próxima fase: PDV, estoque e caixa — a loja começa a vender.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

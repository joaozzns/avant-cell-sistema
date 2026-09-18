import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CancelDocButton } from "./cancel-button";

const DOC_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  authorized:  { label: "Autorizada",   variant: "default" },
  pending:     { label: "Processando",  variant: "secondary" },
  rejected:    { label: "Rejeitada",    variant: "destructive" },
  canceled:    { label: "Cancelada",    variant: "outline" },
  denied:      { label: "Denegada",     variant: "destructive" },
  contingency: { label: "Contingência", variant: "secondary" },
  voided:      { label: "Inutilizada",  variant: "outline" },
};

export default async function FiscalPage() {
  const { supabase, storeId } = await getSessionContext();

  const [{ data: docs }, { data: gateway }] = await Promise.all([
    supabase
      .from("fiscal_documents")
      .select("id, kind, status, number, series, environment, total, access_key, rejection_reason, issued_at, created_at, sales(number)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("integrations").select("name, status").eq("kind", "fiscal_gateway").maybeSingle(),
  ]);

  const rejected = (docs ?? []).filter((d) => d.status === "rejected").length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fiscal — monitor de notas</h1>
          <p className="text-sm text-muted-foreground">
            {gateway?.status === "connected"
              ? `Gateway: ${gateway.name} conectado`
              : "Sem gateway contratado — emissão em modo simulado (homologação)"}
            {rejected > 0 && <span className="ml-2 font-medium text-destructive">· {rejected} rejeitada(s)</span>}
          </p>
        </div>
        <Link href="/fiscal/configuracoes" className={buttonVariants({ variant: "outline" })}>
          Configurações fiscais
        </Link>
      </div>

      <div className="min-w-0 rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nº / série</TableHead>
              <TableHead>Venda</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(docs ?? []).map((d) => {
              const st = DOC_STATUS[d.status] ?? { label: d.status, variant: "outline" as const };
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium uppercase">{d.kind}</TableCell>
                  <TableCell>{d.number ?? "—"}/{d.series}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {(d.sales as { number?: number } | null)?.number
                      ? `#${(d.sales as { number?: number }).number}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(d.issued_at ?? d.created_at)}</TableCell>
                  <TableCell className="text-right">{brl(d.total)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {d.environment === "production" ? "produção" : "homolog."}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {d.rejection_reason && (
                      <p className="mt-0.5 max-w-52 text-xs text-destructive">{d.rejection_reason}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.status === "authorized" && (
                      <CancelDocButton docId={d.id} number={d.number} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(docs ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhuma nota emitida. Emita pela tela da venda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

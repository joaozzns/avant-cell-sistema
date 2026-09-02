import { getSessionContext } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const ACTION_LABEL: Record<string, string> = {
  insert: "criou", update: "alterou", delete: "excluiu",
};

export default async function AuditPage() {
  const { supabase } = await getSessionContext();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, table_name, record_id, user_id, created_at, before, after")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log de auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Somente leitura — nenhum perfil consegue apagar. Últimos 100 eventos.
        </p>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead>Alteração</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs ?? []).map((l) => {
              const before = (l.before ?? {}) as Record<string, unknown>;
              const after = (l.after ?? {}) as Record<string, unknown>;
              const changed = l.action === "update"
                ? Object.keys(after).filter((k) =>
                    JSON.stringify(after[k]) !== JSON.stringify(before[k])
                    && !["updated_at"].includes(k)).slice(0, 4)
                : [];
              return (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDateTime(l.created_at)}
                  </TableCell>
                  <TableCell>{names.get(l.user_id ?? "") ?? "sistema"}</TableCell>
                  <TableCell>
                    <Badge variant={l.action === "delete" ? "destructive" : "secondary"}>
                      {ACTION_LABEL[l.action] ?? l.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.table_name}</TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {changed.length > 0
                      ? changed.map((k) => `${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`).join(" · ").slice(0, 120)
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {(logs ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Sem eventos (o log registra operações sensíveis: vendas, caixa, OS, estoque, contas).
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

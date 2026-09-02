import { getSessionContext } from "@/lib/context";
import { SupplierForm } from "./supplier-form";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function SuppliersPage() {
  const { supabase } = await getSessionContext();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, cnpj, contact, payment_terms, lead_time_days, active")
    .order("name");

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Fornecedores</h1>
      <SupplierForm />
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Cond. pagto</TableHead>
              <TableHead>Prazo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(suppliers ?? []).map((s) => {
              const c = (s.contact ?? {}) as { phone?: string; email?: string; seller?: string };
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.cnpj ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[c.seller, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.payment_terms ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.lead_time_days ? `${s.lead_time_days} dias` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {(suppliers ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum fornecedor cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

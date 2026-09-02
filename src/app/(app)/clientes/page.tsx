import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { fmtDate } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase } = await getSessionContext();

  let query = supabase
    .from("customers")
    .select("id, name, cpf_cnpj, phone, whatsapp, email, debt_flag, created_at")
    .eq("active", true)
    .order("name")
    .limit(100);
  if (q) {
    query = query.or(`name.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  const { data: customers } = await query;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">{customers?.length ?? 0} clientes</p>
        </div>
        <Link href="/clientes/novo" className={buttonVariants({})}>Novo cliente</Link>
      </div>

      <form className="flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, CPF ou telefone…" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(customers ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.debt_flag && <Badge variant="destructive" className="ml-2">débito</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.cpf_cnpj ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.whatsapp ?? c.phone ?? c.email ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/clientes/${c.id}`} className="text-sm underline-offset-4 hover:underline">
                    editar
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {(customers ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum cliente ainda.{" "}
                  <Link href="/clientes/novo" className="underline">Cadastre o primeiro</Link>.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

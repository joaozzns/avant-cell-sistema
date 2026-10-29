import { getSessionContext } from "@/lib/context";
import { ListaLojas, type Loja } from "./lista";

export default async function LojasPage() {
  const { supabase, companyId, storeId } = await getSessionContext();

  const [{ data: lojas }, { data: vinculos }] = await Promise.all([
    supabase.from("stores")
      .select("id, name, cnpj, phone, active, created_at")
      .eq("company_id", companyId)
      .order("active", { ascending: false }).order("name"),
    supabase.from("user_stores").select("store_id"),
  ]);

  const pessoas = new Map<string, number>();
  for (const v of vinculos ?? []) pessoas.set(v.store_id, (pessoas.get(v.store_id) ?? 0) + 1);

  const lista: Loja[] = (lojas ?? []).map((l) => ({
    id: l.id as string,
    nome: l.name as string,
    cnpj: (l.cnpj as string | null) ?? "",
    telefone: (l.phone as string | null) ?? "",
    ativa: Boolean(l.active),
    pessoas: pessoas.get(l.id as string) ?? 0,
    atual: l.id === storeId,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lojas</h1>
        <p className="text-sm text-muted-foreground">
          Cada loja tem caixa, estoque e numeração próprios. Clientes, produtos e formas de pagamento valem para todas.
        </p>
      </div>
      <ListaLojas lojas={lista} />
    </div>
  );
}

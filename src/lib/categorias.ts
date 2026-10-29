import type { createClient } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof createClient>>;

export type TipoCategoria = "device" | "accessory";
export type Categoria = { id: string; name: string; active: boolean; kind: TipoCategoria | null };

/* Lê as categorias com o tipo (Acessórios / Aparelhos). Se a coluna kind
 * ainda não existir no banco (migração 075 pendente), devolve todas sem
 * tipo em vez de quebrar a tela: categoria sem tipo aparece nos dois lados. */
export async function lerCategorias(supabase: Cliente, opcoes: { soAtivas?: boolean } = {}): Promise<Categoria[]> {
  let consulta = supabase.from("categories").select("id, name, active, kind").order("name");
  if (opcoes.soAtivas) consulta = consulta.eq("active", true);
  const { data, error } = await consulta;
  if (!error) return (data ?? []) as Categoria[];

  if (error.code !== "42703") return [];
  let antiga = supabase.from("categories").select("id, name, active").order("name");
  if (opcoes.soAtivas) antiga = antiga.eq("active", true);
  const { data: semTipo } = await antiga;
  return (semTipo ?? []).map((c) => ({ ...(c as Omit<Categoria, "kind">), kind: null }));
}

/* categorias que servem para um produto daquele tipo: as dele e as antigas sem tipo */
export function categoriasDoTipo(todas: Categoria[], tipo: string): Categoria[] {
  if (tipo !== "device" && tipo !== "accessory") return todas;
  return todas.filter((c) => c.kind === tipo || c.kind === null);
}

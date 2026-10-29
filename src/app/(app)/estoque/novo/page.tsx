import { getSessionContext } from "@/lib/context";
import { lerCategorias } from "@/lib/categorias";
import { ProductForm } from "../product-form";

const TITULO: Record<string, string> = { accessory: "Novo acessório", device: "Novo modelo de aparelho" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const { supabase } = await getSessionContext();
  const [categories, { data: brands }] = await Promise.all([
    lerCategorias(supabase, { soAtivas: true }),
    supabase.from("brands").select("id, name").eq("active", true).order("name"),
  ]);
  const voltar = tipo === "accessory" ? "/estoque/acessorios" : tipo === "device" ? "/estoque/aparelhos" : undefined;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{TITULO[tipo ?? ""] ?? "Novo produto"}</h1>
      <ProductForm categories={categories} brands={brands ?? []} tipoInicial={tipo} voltar={voltar} />
    </div>
  );
}

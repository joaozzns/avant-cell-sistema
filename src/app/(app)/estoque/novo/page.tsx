import { getSessionContext } from "@/lib/context";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const { supabase } = await getSessionContext();
  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("active", true).order("name"),
    supabase.from("brands").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Novo produto</h1>
      <ProductForm categories={categories ?? []} brands={brands ?? []} />
    </div>
  );
}

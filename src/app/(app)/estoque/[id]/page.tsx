import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { ProductForm } from "../product-form";
import { StockAdjustForm } from "../stock-adjust-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, storeId } = await getSessionContext();

  const [{ data: product }, { data: categories }, { data: brands }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("categories").select("id, name").eq("active", true).order("name"),
      supabase.from("brands").select("id, name").eq("active", true).order("name"),
    ]);
  if (!product) notFound();

  const { data: stock } = await supabase
    .from("stock_items")
    .select("qty, min_qty, location")
    .eq("product_id", id)
    .eq("store_id", storeId)
    .maybeSingle();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
        <p className="text-sm text-muted-foreground">
          Estoque nesta loja: {product.serialized ? "controle unitário por IMEI" : Number(stock?.qty ?? 0)}
        </p>
      </div>
      {!product.serialized && product.type !== "service" && (
        <StockAdjustForm productId={id} />
      )}
      <ProductForm product={product} categories={categories ?? []} brands={brands ?? []} />
    </div>
  );
}

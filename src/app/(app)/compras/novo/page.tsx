import { getSessionContext } from "@/lib/context";
import { PoForm } from "./po-form";

export default async function NewPoPage() {
  const { supabase } = await getSessionContext();
  const { data: suppliers } = await supabase
    .from("suppliers").select("id, name").eq("active", true).order("name");

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Novo pedido de compra</h1>
      <PoForm suppliers={suppliers ?? []} />
    </div>
  );
}

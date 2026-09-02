import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { buttonVariants } from "@/components/ui/button";
import { PdvClient } from "./pdv-client";

export default async function PdvPage() {
  const { supabase, storeId, userId } = await getSessionContext();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, opening_amount, opened_at")
    .eq("store_id", storeId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();

  if (!session) {
    return (
      <div className="grid place-items-center py-24 text-center">
        <div className="grid max-w-md gap-4">
          <h1 className="text-2xl font-bold tracking-tight">PDV — frente de caixa</h1>
          <p className="text-muted-foreground">
            Sem caixa aberto não há venda. Abra o caixa com o fundo de troco
            para começar a operar.
          </p>
          <Link href="/pdv/caixa" className={buttonVariants({})}>
            Abrir caixa
          </Link>
        </div>
      </div>
    );
  }

  return <PdvClient />;
}

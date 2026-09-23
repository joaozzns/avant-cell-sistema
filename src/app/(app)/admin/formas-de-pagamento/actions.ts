"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

const CAMINHO = "/admin/formas-de-pagamento";

export type FaixaParcela = { n: number; fee_percent: number; days: number };

export async function salvarForma(entrada: {
  id: string;
  taxa: number;
  dias: number;
  parcelas: FaixaParcela[];
  ativa: boolean;
}) {
  const { supabase, companyId } = await getSessionContext();

  if (entrada.taxa < 0 || entrada.taxa > 100) return { error: "A taxa precisa ficar entre 0% e 100%." };
  if (entrada.dias < 0 || entrada.dias > 365) return { error: "Prazo de recebimento fora do razoável." };
  for (const f of entrada.parcelas) {
    if (f.fee_percent < 0 || f.fee_percent > 100) {
      return { error: `Taxa de ${f.n}x fora da faixa de 0% a 100%.` };
    }
  }

  const { error } = await supabase
    .from("payment_methods")
    .update({
      fee_percent: entrada.taxa,
      days_to_receive: entrada.dias,
      installments: entrada.parcelas
        .filter((f) => f.fee_percent > 0 || f.days > 0)
        .sort((a, b) => a.n - b.n),
      active: entrada.ativa,
    })
    .eq("id", entrada.id)
    .eq("company_id", companyId);
  if (error) return { error: error.message };

  revalidatePath(CAMINHO);
  revalidatePath("/financeiro/conciliacao");
  return { ok: true };
}

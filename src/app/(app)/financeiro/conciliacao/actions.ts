"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

const CAMINHO = "/financeiro/conciliacao";

export type LinhaExtrato = {
  adquirente: string;
  bruto: number;
  taxa: number;
  liquido: number;
  previsto: string | null;
  recebido: string | null;
  autorizacao: string | null;
  bandeira: string | null;
};

export async function importarExtrato(linhas: LinhaExtrato[], lote: string) {
  const { supabase, companyId, storeId } = await getSessionContext();
  if (!linhas.length) return { error: "Nenhuma linha para importar." };

  const { error } = await supabase.from("card_settlements").insert(
    linhas.map((l) => ({
      company_id: companyId,
      store_id: storeId,
      acquirer: l.adquirente || "maquininha",
      gross: l.bruto,
      fee: l.taxa,
      net: l.liquido,
      expected_date: l.previsto,
      received_date: l.recebido,
      import_batch: lote,
      status: "pending",
      raw: { auth_code: l.autorizacao, bandeira: l.bandeira },
    })),
  );
  if (error) return { error: error.message };

  revalidatePath(CAMINHO);
  return { importadas: linhas.length };
}

export async function conciliar(lote?: string) {
  const { supabase, storeId } = await getSessionContext();
  const { data, error } = await supabase.rpc("card_reconcile", {
    p: { store_id: storeId, import_batch: lote ?? null },
  });
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return data as { casados: number; divergentes: number; sem_par: number };
}

export async function contestar(id: string) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("card_settlements").update({ status: "contested" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return {};
}

import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { lojasDestino } from "../actions";
import { FormTransferencia } from "./form";

export default async function NovaTransferenciaPage() {
  await getSessionContext();
  const lojas = await lojasDestino();
  if (lojas.length === 0) redirect("/estoque/transferencias?sem-loja=1");
  return <FormTransferencia lojas={lojas} />;
}

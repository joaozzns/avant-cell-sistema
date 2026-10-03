import { getSessionContext } from "@/lib/context";
import { CATALOGO, PADRAO } from "@/lib/atalhos";
import { EscolhaDeAtalhos } from "./escolha";

export const metadata = { title: "Atalhos" };

export default async function AtalhosPage() {
  const { supabase, userId } = await getSessionContext();

  const { data } = await supabase
    .from("user_shortcuts")
    .select("items")
    .eq("user_id", userId)
    .maybeSingle();

  const escolhidos = (data?.items as string[] | undefined) ?? [];

  return (
    <EscolhaDeAtalhos
      catalogo={CATALOGO}
      escolhidos={escolhidos.length ? escolhidos : PADRAO}
      personalizado={escolhidos.length > 0}
    />
  );
}

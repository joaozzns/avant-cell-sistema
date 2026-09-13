import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Contexto da sessão: usuário, empresa e loja ativa (primeira vinculada).
 *
 *  Custava caro: layout e página chamavam isto cada um por conta própria, e cada
 *  chamada fazia getUser() (ida ao Supabase Auth), depois profiles, depois
 *  user_stores — três idas em série, repetidas duas vezes por navegação.
 *
 *  - cache() do React: layout e página da MESMA requisição recebem o mesmo
 *    resultado, então as consultas acontecem uma vez só.
 *  - getClaims() no lugar de getUser(): o projeto assina os tokens com ES256 e
 *    publica a chave no JWKS, então a assinatura é conferida localmente, com a
 *    chave pública em cache, sem ida à rede. Os dados continuam protegidos: cada
 *    consulta passa pelo PostgREST, que valida o JWT e aplica o RLS.
 *  - perfil (com a empresa) e loja saem em paralelo — ambos só dependem do id,
 *    que já vem nas claims. */
export const getSessionContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const userId = claims.sub;

  const [{ data: profile }, { data: userStore }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, company_id, companies(name)")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_stores")
      .select("store_id, stores(id, name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.company_id || !userStore) redirect("/onboarding");

  const store = userStore.stores as unknown as { id: string; name: string };
  const company = profile.companies as unknown as { name?: string } | null;

  return {
    supabase,
    userId,
    email: (claims.email as string | undefined) ?? "",
    fullName: profile.full_name,
    companyId: profile.company_id as string,
    companyName: company?.name,
    storeId: store.id,
    storeName: store.name,
  };
});

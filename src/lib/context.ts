import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Contexto da sessão: usuário, empresa e loja ativa (primeira vinculada). */
export async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!profile?.company_id) redirect("/onboarding");

  const { data: userStore } = await supabase
    .from("user_stores")
    .select("store_id, stores(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!userStore) redirect("/onboarding");

  const store = userStore.stores as unknown as { id: string; name: string };

  return {
    supabase,
    userId: user.id,
    fullName: profile.full_name,
    companyId: profile.company_id as string,
    storeId: store.id,
    storeName: store.name,
  };
}

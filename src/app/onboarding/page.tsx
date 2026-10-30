import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormularioEmpresa } from "./form";

/* Esta tela só serve a quem acabou de criar a conta e ainda não tem empresa.
 * Sem esta conferência ela abria para qualquer um que caísse no endereço,
 * inclusive o dono de uma loja que já existe. */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles").select("company_id").eq("id", id).maybeSingle();
  if (!perfil) redirect("/login");
  if (perfil.company_id) redirect("/dashboard");

  return <FormularioEmpresa />;
}

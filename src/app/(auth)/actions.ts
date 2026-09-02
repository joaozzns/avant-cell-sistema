"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function login(_prev: { error?: string }, formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(_prev: { error?: string }, formData: FormData) {
  const supabase = await createClient();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return { error: "A senha precisa de no mínimo 8 caracteres, com letra e número." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    return { error: "Não foi possível criar a conta. " + error.message };
  }
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function requestPasswordReset(
  _prev: { done?: boolean },
  formData: FormData
) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  // Mensagem neutra mesmo se o e-mail não existir (evita enumeração)
  await supabase.auth.resetPasswordForEmail(email);
  return { done: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createCompany(
  _prev: { error?: string },
  formData: FormData
) {
  const supabase = await createClient();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const storeName = String(formData.get("store_name") ?? "").trim() || "Loja principal";

  if (!companyName) return { error: "Informe o nome da empresa." };

  const { error } = await supabase.rpc("create_company", {
    p_company_name: companyName,
    p_store_name: storeName,
  });
  if (error) {
    return { error: "Erro ao criar a empresa: " + error.message };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

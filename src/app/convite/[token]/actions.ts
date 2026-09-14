"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function aceitarConvite(_prev: { erro?: string }, formData: FormData): Promise<{ erro?: string }> {
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { erro: "Link de convite inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_accept", { p_token: token });
  if (error) return { erro: error.message };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

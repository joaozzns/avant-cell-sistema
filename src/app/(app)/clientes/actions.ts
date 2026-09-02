"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export type ActionState = { error?: string };

export async function saveCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, companyId } = await getSessionContext();
  const id = String(formData.get("id") ?? "");

  const payload = {
    company_id: companyId,
    kind: String(formData.get("kind") ?? "person"),
    name: String(formData.get("name") ?? "").trim(),
    cpf_cnpj: String(formData.get("cpf_cnpj") ?? "").replace(/\D/g, "") || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    birthdate: String(formData.get("birthdate") ?? "") || null,
    origin: String(formData.get("origin") ?? "") || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    consent_contact: formData.get("consent_contact") === "on",
    consent_at: formData.get("consent_contact") === "on" ? new Date().toISOString() : null,
  };
  if (!payload.name) return { error: "Informe o nome." };

  if (id) {
    const { error } = await supabase.from("customers").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("customers").insert(payload);
    if (error) {
      return {
        error: error.code === "23505"
          ? "Já existe cliente com esse CPF/CNPJ."
          : error.message,
      };
    }
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

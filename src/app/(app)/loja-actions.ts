"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

/** Troca a loja ativa. Só aceita loja em que a pessoa realmente trabalha:
 *  o cookie é palpite do navegador, não autorização. */
export async function trocarLoja(lojaId: string) {
  const { lojas } = await getSessionContext();
  if (!lojas.some((l) => l.id === lojaId)) {
    return { error: "Você não tem acesso a esta loja." };
  }

  (await cookies()).set("avc-loja", lojaId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function publicDecide(
  token: string,
  approve: boolean,
  reason?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") || null;

  const { error } = await supabase.rpc("public_os_decide", {
    p_token: token,
    p_approve: approve,
    p_reason: reason ?? null,
    p_ip: ip,
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/acompanhar/${token}`);
  return {};
}

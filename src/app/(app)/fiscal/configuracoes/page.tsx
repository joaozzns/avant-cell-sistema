import { getSessionContext } from "@/lib/context";
import { FiscalSettingsForm } from "./settings-form";

export default async function FiscalSettingsPage() {
  const { supabase, companyId } = await getSessionContext();
  const [{ data: settings }, { data: gateway }] = await Promise.all([
    supabase.from("fiscal_settings").select("*")
      .eq("company_id", companyId).is("store_id", null).maybeSingle(),
    supabase.from("integrations").select("name")
      .eq("kind", "fiscal_gateway").eq("status", "connected").maybeSingle(),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Configurações fiscais</h1>
      <FiscalSettingsForm settings={settings} gateway={gateway} />
    </div>
  );
}

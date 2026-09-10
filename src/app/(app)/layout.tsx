import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) redirect("/onboarding");

  const [{ data: userStore }, { data: company }] = await Promise.all([
    supabase
      .from("user_stores")
      .select("store_id, stores(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .maybeSingle(),
  ]);

  const storeName = (userStore?.stores as { name?: string } | null)?.name;

  return (
    <AppShell
      nome={profile?.full_name || user.email || ""}
      email={user.email || ""}
      storeName={storeName}
      companyName={company?.name}
    >
      {children}
    </AppShell>
  );
}

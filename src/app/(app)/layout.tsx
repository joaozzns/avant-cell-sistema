import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

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

  const { data: userStore } = await supabase
    .from("user_stores")
    .select("store_id, stores(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const storeName = (userStore?.stores as { name?: string } | null)?.name;

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={profile?.full_name || user.email || ""}
          storeName={storeName}
        />
        <main className="flex-1 bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

import { getSessionContext } from "@/lib/context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* mesmo contexto que a página vai pedir: cache() garante uma consulta só */
  const { fullName, email, storeName, companyName, storeId, lojas } = await getSessionContext();

  return (
    <AppShell
      nome={fullName || email}
      email={email}
      storeName={storeName}
      companyName={companyName}
      lojas={lojas}
      lojaAtual={storeId}
    >
      {children}
    </AppShell>
  );
}

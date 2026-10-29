import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/context";

/* Tirar o item do menu não basta: o vendedor que digitasse /admin/lojas
 * abriria a tela. Toda página de Administração passa por aqui antes.
 * O banco continua sendo a trava de verdade (RLS só deixa dono e
 * administrador gravar); isto evita mostrar a tela a quem não pode usá-la. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { administrador } = await getSessionContext();
  if (!administrador) redirect("/dashboard");
  return children;
}

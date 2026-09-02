import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  const { supabase, companyId } = await getSessionContext();

  const [{ data: users }, { data: stores }, { data: roles }] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, active, user_stores(store_id, roles(name), stores(name))")
      .eq("company_id", companyId).order("full_name"),
    supabase.from("stores").select("id, name, active").order("name"),
    supabase.from("roles").select("id, key, name, is_system").order("is_system", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
        <Link href="/admin/auditoria" className={buttonVariants({ variant: "outline" })}>
          Log de auditoria
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuários</CardTitle>
            <CardDescription>
              Novos usuários entram por /cadastro; o admin vincula loja e papel
              direto no banco por enquanto (telas de convite na próxima fase).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {(users ?? []).map((u) => {
              const links = (u.user_stores ?? []) as {
                roles: { name?: string } | null; stores: { name?: string } | null;
              }[];
              return (
                <div key={u.id} className="grid gap-0.5 rounded border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{u.full_name || u.email}</span>
                    {!u.active && <Badge variant="destructive">inativo</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {u.email} · {links.map((l) =>
                      `${l.roles?.name ?? "?"} em ${l.stores?.name ?? "?"}`).join(" · ") || "sem loja vinculada"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Lojas</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {(stores ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="font-medium">{s.name}</span>
                  {!s.active && <Badge variant="destructive">inativa</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perfis de acesso</CardTitle>
              <CardDescription>7 papéis do sistema com matriz de 53 permissões</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(roles ?? []).map((r) => (
                <Badge key={r.id} variant={r.is_system ? "secondary" : "outline"}>{r.name}</Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

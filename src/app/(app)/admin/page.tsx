import Link from "next/link";
import { headers } from "next/headers";
import { Equipe } from "./equipe";
import { getSessionContext } from "@/lib/context";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  const { supabase, companyId, userId } = await getSessionContext();

  const [{ data: users }, { data: stores }, { data: roles }, { data: convites }] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, active, user_stores(store_id, role_id, roles(key, name), stores(name))")
      .eq("company_id", companyId).order("full_name"),
    supabase.from("stores").select("id, name, active").order("name"),
    supabase.from("roles").select("id, key, name, is_system").order("is_system", { ascending: false }),
    supabase.from("company_invites")
      .select("id, token, email, expires_at, stores(name), roles(name)")
      .is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  type LinhaVinculo = { store_id: string; role_id: string; roles: { key?: string; name?: string } | null; stores: { name?: string } | null };
  const membros = (users ?? []).map((u) => ({
    id: u.id as string,
    nome: (u.full_name as string) ?? "",
    email: (u.email as string) ?? "",
    ativo: Boolean(u.active),
    vinculos: ((u.user_stores ?? []) as unknown as LinhaVinculo[]).map((l) => ({
      store_id: l.store_id, role_id: l.role_id,
      role_key: l.roles?.key ?? "", role_name: l.roles?.name ?? "?", store_name: l.stores?.name ?? "?",
    })),
  }));
  const eu = membros.find((m) => m.id === userId);
  const podeGerenciar = Boolean(eu?.vinculos.some((v) => v.role_key === "owner" || v.role_key === "admin"));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origem = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const listaConvites = (convites ?? []).map((c) => ({
    id: c.id as string, token: c.token as string, email: (c.email as string | null) ?? null,
    loja: (c.stores as unknown as { name?: string } | null)?.name ?? "?",
    papel: (c.roles as unknown as { name?: string } | null)?.name ?? "?",
    expira: new Date(c.expires_at as string).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
        <Link href="/admin/auditoria" className={buttonVariants({ variant: "outline" })}>
          Log de auditoria
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Equipe
          membros={membros}
          lojas={(stores ?? []).filter((s) => s.active).map((s) => ({ id: s.id as string, name: s.name as string }))}
          papeis={(roles ?? []).filter((r) => r.key !== "owner").map((r) => ({ id: r.id as string, key: r.key as string, name: r.name as string }))}
          convites={listaConvites}
          usuarioAtual={userId}
          podeGerenciar={podeGerenciar}
          origem={origem}
        />

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

import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { AceitarConvite } from "./aceitar";

type Previa = {
  status: "valid" | "expired" | "used" | "revoked" | "not_found";
  company_name?: string; store_name?: string; role_name?: string;
  email_hint?: string | null; expires_at?: string;
};

const MOTIVO: Record<Exclude<Previa["status"], "valid">, string> = {
  expired: "Este convite expirou.",
  used: "Este convite já foi usado.",
  revoked: "Este convite foi cancelado.",
  not_found: "Este link de convite não é válido.",
};

export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string; aviso?: string }>;
}) {
  const { token } = await params;
  const { erro, aviso } = await searchParams;
  const supabase = await createClient();

  const tokenValido = /^[0-9a-f-]{36}$/i.test(token);
  const { data } = tokenValido
    ? await supabase.rpc("invite_preview", { p_token: token })
    : { data: { status: "not_found" } };
  const previa = (data ?? { status: "not_found" }) as Previa;

  const { data: sessao } = await supabase.auth.getClaims();
  const uid = sessao?.claims?.sub as string | undefined;
  const emailLogado = sessao?.claims?.email as string | undefined;
  let empresaAtual: string | null = null;
  if (uid) {
    const { data: perfil } = await supabase.from("profiles").select("company_id, companies(name)").eq("id", uid).maybeSingle();
    empresaAtual = (perfil?.companies as unknown as { name?: string } | null)?.name ?? null;
  }
  const q = `?convite=${token}`;

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Image src="/logo-escura.svg" alt="Avant Cell" width={199} height={48} className="h-11 w-auto dark:hidden" priority />
          <Image src="/logo-branca.svg" alt="Avant Cell" width={199} height={48} className="hidden h-11 w-auto dark:block" priority />
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {previa.status !== "valid" ? (
            <div className="grid gap-3 text-center">
              <h1 className="text-lg font-semibold">{MOTIVO[previa.status]}</h1>
              <p className="text-sm text-muted-foreground">Peça um novo link a quem convidou você.</p>
              <Link href="/login" className={buttonVariants({ variant: "outline" })}>Ir para o login</Link>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-1 text-center">
                <p className="text-sm text-muted-foreground">Você foi convidado para a equipe da</p>
                <h1 className="text-xl font-bold tracking-tight">{previa.company_name}</h1>
                <p className="text-sm">
                  como <span className="font-semibold">{previa.role_name}</span> em{" "}
                  <span className="font-semibold">{previa.store_name}</span>
                </p>
                {previa.email_hint && (
                  <p className="text-xs text-muted-foreground">Convite para o e-mail {previa.email_hint}</p>
                )}
              </div>

              {aviso === "confirme" && (
                <p className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-sm text-primary">
                  Conta criada. Confirme seu e-mail pelo link que enviamos e depois abra este convite de novo para entrar na equipe.
                </p>
              )}
              {erro && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">{erro}</p>
              )}

              {uid ? (
                <div className="grid gap-3">
                  <p className="text-center text-xs text-muted-foreground">
                    Entrando como <span className="font-medium text-foreground">{emailLogado}</span>
                    {empresaAtual && <> · já faz parte de <span className="font-medium text-foreground">{empresaAtual}</span></>}
                  </p>
                  <AceitarConvite token={token} />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Link href={`/cadastro${q}`} className={buttonVariants({})}>Criar minha conta</Link>
                  <Link href={`/login${q}`} className={buttonVariants({ variant: "outline" })}>Já tenho conta — entrar</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Check, UserPlus, Trash2, X, MessageCircle, Clock, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { criarConvite, cancelarConvite, mudarPapel, removerMembro, type EstadoConvite } from "./equipe-actions";

type Loja = { id: string; name: string };
type Papel = { id: string; key: string; name: string };
type Vinculo = { store_id: string; role_id: string; role_key: string; role_name: string; store_name: string };
type Membro = { id: string; nome: string; email: string; ativo: boolean; vinculos: Vinculo[] };
type Convite = { id: string; token: string; email: string | null; loja: string; papel: string; expira: string };

const campo = "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-60";

function mensagemWhatsApp(link: string, loja: string) {
  return `Olá! Você foi convidado para a equipe da ${loja} no Avant Cell. Crie sua conta ou entre por este link: ${link}`;
}

function CopiarLink({ link, loja, compacto }: { link: string; loja: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copie o link do convite:", link);
    }
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-2", !compacto && "w-full")}>
      {!compacto && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite"
          className={cn(campo, "min-w-0 flex-1 font-mono text-xs")} />
      )}
      <Button type="button" variant="outline" size="sm" onClick={copiar}>
        {copiado ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Copiado" : "Copiar link"}
      </Button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(mensagemWhatsApp(link, loja))}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:border-success hover:text-success"
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
    </div>
  );
}

export function Equipe({
  membros, lojas, papeis, convites, usuarioAtual, podeGerenciar, origem,
}: {
  membros: Membro[]; lojas: Loja[]; papeis: Papel[]; convites: Convite[];
  usuarioAtual: string; podeGerenciar: boolean; origem: string;
}) {
  const [abrirConvite, setAbrirConvite] = useState(false);
  const [estado, acao, enviando] = useActionState<EstadoConvite, FormData>(criarConvite, {});
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const papelPadrao = papeis.find((p) => p.key === "seller")?.id ?? papeis[0]?.id;
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.name ?? "loja";

  function executar(fn: () => Promise<{ erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Equipe</CardTitle>
        <CardDescription>
          {podeGerenciar
            ? "Convide funcionários por link. Cada convite vale para uma loja e um papel, serve uma vez e expira em 7 dias."
            : "Somente o dono e administradores gerenciam a equipe."}
        </CardDescription>
        {podeGerenciar && (
          <CardAction>
            <Button size="sm" onClick={() => setAbrirConvite((v) => !v)} variant={abrirConvite ? "outline" : "default"}>
              {abrirConvite ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {abrirConvite ? "Fechar" : "Convidar"}
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="grid gap-5 pt-5">
        {abrirConvite && podeGerenciar && (
          <div className="grid gap-4 rounded-xl border bg-muted/40 p-4">
            <form action={acao} className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr_auto] sm:items-end">
              <label className="grid gap-1 text-xs font-medium">
                Loja
                <select name="store_id" className={campo} defaultValue={lojas[0]?.id} required>
                  {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Papel
                <select name="role_id" className={campo} defaultValue={papelPadrao} required>
                  {papeis.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                E-mail do funcionário <span className="font-normal text-muted-foreground">(opcional — restringe o convite)</span>
                <input name="email" type="email" placeholder="funcionario@email.com" className={campo} />
              </label>
              <Button type="submit" disabled={enviando}>
                <Link2 className="h-4 w-4" /> {enviando ? "Gerando…" : "Gerar link"}
              </Button>
            </form>
            {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
            {estado.link && (
              <div className="grid gap-2 rounded-lg border border-success/30 bg-success/8 p-3">
                <p className="text-sm font-medium text-success">Convite criado. Envie o link para o funcionário:</p>
                <CopiarLink link={estado.link} loja={lojas[0]?.name ?? "loja"} />
              </div>
            )}
          </div>
        )}

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}

        <div className="grid gap-2">
          {membros.map((m) => {
            const souEu = m.id === usuarioAtual;
            const ehDono = m.vinculos.some((v) => v.role_key === "owner");
            return (
              <div key={m.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{m.nome || m.email}</span>
                    {souEu && <Badge variant="secondary">você</Badge>}
                    {ehDono && <Badge>dono</Badge>}
                    {!m.ativo && <Badge variant="destructive">inativo</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {m.vinculos.length === 0 && <span className="text-xs text-muted-foreground">sem loja vinculada</span>}
                  {m.vinculos.map((v) => {
                    const travado = !podeGerenciar || souEu || v.role_key === "owner";
                    return (
                      <label key={v.store_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {v.store_name}:
                        {travado ? (
                          <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{v.role_name}</span>
                        ) : (
                          <select
                            aria-label={`Papel de ${m.nome || m.email} em ${v.store_name}`}
                            className={cn(campo, "h-8 w-auto")}
                            defaultValue={v.role_id}
                            disabled={pendente}
                            onChange={(e) => executar(() => mudarPapel(m.id, v.store_id, e.target.value))}
                          >
                            {papeis.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </label>
                    );
                  })}
                  {podeGerenciar && !souEu && !ehDono && (
                    <Button
                      variant="outline" size="sm" disabled={pendente}
                      className="text-destructive hover:border-destructive"
                      onClick={() => {
                        if (confirm(`Remover ${m.nome || m.email} da equipe? O acesso é cortado na hora.`)) {
                          executar(() => removerMembro(m.id));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {podeGerenciar && convites.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Convites pendentes</p>
            {convites.map((c) => (
              <div key={c.id} className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{c.papel} em {c.loja}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {c.email ? `para ${c.email}` : "qualquer e-mail"}
                    <span aria-hidden>·</span>
                    <Clock className="h-3 w-3" /> expira em {c.expira}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopiarLink link={`${origem}/convite/${c.token}`} loja={c.loja} compacto />
                  <Button variant="outline" size="sm" disabled={pendente}
                    onClick={() => { if (confirm("Cancelar este convite? O link deixa de funcionar.")) executar(() => cancelarConvite(c.id)); }}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

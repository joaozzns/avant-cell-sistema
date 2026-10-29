"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { criarLoja, editarLoja, alternarLoja, type EstadoLoja } from "./actions";

export type Loja = {
  id: string; nome: string; cnpj: string; telefone: string;
  ativa: boolean; pessoas: number; atual: boolean;
};

const campo = "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-60";

function formatarCnpj(v: string) {
  return v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v;
}
function formatarTelefone(v: string) {
  if (v.length === 11) return v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (v.length === 10) return v.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v;
}

/* o mesmo formulário cria e edita: com `loja` ele edita aquela */
function FormLoja({ loja, aoTerminar }: { loja?: Loja; aoTerminar: () => void }) {
  const [estado, acao, enviando] = useActionState<EstadoLoja, FormData>(loja ? editarLoja : criarLoja, {});

  useEffect(() => {
    if (estado.ok) aoTerminar();
  }, [estado, aoTerminar]);

  return (
    <form action={acao} className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      {loja && <input type="hidden" name="id" value={loja.id} />}
      <div className="grid gap-1.5">
        <label htmlFor={`nome-${loja?.id ?? "nova"}`} className="text-sm font-medium">Nome da loja</label>
        <input id={`nome-${loja?.id ?? "nova"}`} name="nome" required maxLength={80} autoFocus
          defaultValue={loja?.nome} placeholder="Ex.: Loja Centro" className={campo} />
        <p className="text-xs text-muted-foreground">Aparece no topo da tela e no cupom.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`cnpj-${loja?.id ?? "nova"}`} className="text-sm font-medium">
            CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input id={`cnpj-${loja?.id ?? "nova"}`} name="cnpj" inputMode="numeric"
            defaultValue={loja ? formatarCnpj(loja.cnpj) : ""} placeholder="00.000.000/0000-00" className={campo} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`tel-${loja?.id ?? "nova"}`} className="text-sm font-medium">
            Telefone <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input id={`tel-${loja?.id ?? "nova"}`} name="telefone" inputMode="tel"
            defaultValue={loja ? formatarTelefone(loja.telefone) : ""} placeholder="(31) 99999-9999" className={campo} />
        </div>
      </div>
      {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : loja ? "Salvar" : "Criar loja"}
        </Button>
        <Button type="button" variant="outline" onClick={aoTerminar} disabled={enviando}>Cancelar</Button>
      </div>
    </form>
  );
}

export function ListaLojas({ lojas }: { lojas: Loja[] }) {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar(loja: Loja) {
    if (loja.ativa && !window.confirm(
      `Desativar "${loja.nome}"?\n\nEla sai do seletor de lojas e não recebe novas vendas. O histórico continua nos relatórios. Quem trabalha só nesta loja perde o acesso até ser ligado a outra.`
    )) return;
    setErro(null);
    iniciar(async () => {
      const r = await alternarLoja(loja.id, !loja.ativa);
      if (r.erro) setErro(r.erro);
    });
  }

  const ativas = lojas.filter((l) => l.ativa).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suas lojas</CardTitle>
        <CardDescription>
          {ativas === 1 ? "1 loja ativa" : `${ativas} lojas ativas`}
          {lojas.length > ativas && ` · ${lojas.length - ativas} desativada${lojas.length - ativas > 1 ? "s" : ""}`}
        </CardDescription>
        {!criando && (
          <CardAction>
            <Button size="sm" onClick={() => { setCriando(true); setEditando(null); }}>
              <Plus className="h-4 w-4" /> Nova loja
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {criando && <FormLoja aoTerminar={() => setCriando(false)} />}
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {lojas.map((l) =>
          editando === l.id ? (
            <FormLoja key={l.id} loja={l} aoTerminar={() => setEditando(null)} />
          ) : (
            <div key={l.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3", !l.ativa && "opacity-60")}>
              <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.nome}</span>
                  {l.atual && <Badge variant="secondary">você está aqui</Badge>}
                  {!l.ativa && <Badge variant="destructive">desativada</Badge>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {l.pessoas === 1 ? "1 pessoa" : `${l.pessoas} pessoas`}
                  </span>
                  {l.cnpj && <span>CNPJ {formatarCnpj(l.cnpj)}</span>}
                  {l.telefone && <span>{formatarTelefone(l.telefone)}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pendente}
                  onClick={() => { setEditando(l.id); setCriando(false); }}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" size="sm" disabled={pendente} onClick={() => alternar(l)}>
                  {l.ativa ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </div>
          )
        )}

        <p className="text-xs text-muted-foreground">
          Para colocar alguém numa loja, vá em Administração › Usuários › Convidar e escolha a loja.
        </p>
      </CardContent>
    </Card>
  );
}

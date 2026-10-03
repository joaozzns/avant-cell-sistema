"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { brl, fmtDate, parseDecimal } from "@/lib/format";
import { MODELOS_COMISSAO, SITUACAO_ASSINATURA } from "@/lib/parceiros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  criarRepresentante, definirModeloComissao, definirRepresentantePrincipal,
  desativarRepresentante, salvarAssinatura, trocarLinkRepresentante,
} from "./actions";

export type Representante = {
  id: string; nome: string; email: string | null; telefone: string | null;
  principal: boolean; ativo: boolean; link: string; convite: string;
  lojas: number; ativas: number; mrr: number;
};

export type Assinatura = {
  empresaId: string; nome: string; representanteId: string | null;
  valor: number; situacao: string; desde: string;
};

export function PainelParceiros({
  representantes, lojas, modelo,
}: {
  representantes: Representante[];
  lojas: Assinatura[];
  modelo: { tipo: string | null; percentual: number | null; fixo: number | null };
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  const [tipo, setTipo] = useState(modelo.tipo ?? "");
  const [percentual, setPercentual] = useState(modelo.percentual ? String(modelo.percentual).replace(".", ",") : "");
  const [fixo, setFixo] = useState(modelo.fixo ? String(modelo.fixo).replace(".", ",") : "");

  const [editando, setEditando] = useState<string | null>(null);
  const [valorLoja, setValorLoja] = useState("");
  const [situacaoLoja, setSituacaoLoja] = useState("trial");
  const [repLoja, setRepLoja] = useState("");

  const mrrTotal = lojas.filter((l) => l.situacao === "active").reduce((s, l) => s + l.valor, 0);
  const ativas = lojas.filter((l) => l.situacao === "active").length;
  const semDono = lojas.filter((l) => !l.representanteId).length;

  function agir(fn: () => Promise<{ error?: string }>, msg?: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.error) { setErro(r.error); return; }
      if (msg) setAviso(msg);
      router.refresh();
    });
  }

  function copiar(texto: string, id: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Representantes Avant Cell</h1>
        <p className="text-sm text-muted-foreground">
          Quem vende o sistema para as lojas, quantas lojas cada um trouxe e quanto elas pagam por
          mês. Esta área é do seu negócio — nenhum lojista enxerga isto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          ["Lojas assinantes", String(ativas)],
          ["Receita mensal", brl(mrrTotal)],
          ["Representantes", String(representantes.filter((r) => r.ativo).length)],
          ["Lojas sem representante", String(semDono)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {/* ---------- modelo de comissão ---------- */}
      <Card className={modelo.tipo ? "" : "border-amber-500/50"}>
        <CardHeader className="border-b py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Como o representante ganha</CardTitle>
            {!modelo.tipo && <Badge variant="destructive">ainda não definido</Badge>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {!modelo.tipo && (
            <p className="text-sm text-muted-foreground">
              Enquanto você não escolher, o painel do representante mostra a carteira e o valor
              mensal dela, mas não mostra comissão — melhor do que exibir um número inventado.
            </p>
          )}
          <div className="grid gap-2">
            {MODELOS_COMISSAO.map((m) => (
              <label key={m.valor}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${tipo === m.valor ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="modelo" className="mt-1" checked={tipo === m.valor}
                  onChange={() => setTipo(m.valor)} />
                <span>
                  <span className="font-medium">{m.rotulo}</span>
                  <span className="block text-xs text-muted-foreground">{m.ajuda}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {tipo.endsWith("percent") && (
              <label className="grid gap-1 text-sm">
                Percentual
                <input value={percentual} onChange={(e) => setPercentual(e.target.value)}
                  placeholder="20" className="h-9 rounded-md border bg-background px-3" />
              </label>
            )}
            {tipo === "fixed_per_store" && (
              <label className="grid gap-1 text-sm">
                Valor por loja
                <input value={fixo} onChange={(e) => setFixo(e.target.value)}
                  placeholder="150,00" className="h-9 rounded-md border bg-background px-3" />
              </label>
            )}
          </div>

          <div>
            <Button disabled={pendente || !tipo}
              onClick={() => agir(() => definirModeloComissao({
                tipo,
                percentual: tipo.endsWith("percent") ? parseDecimal(percentual) : null,
                fixo: tipo === "fixed_per_store" ? parseDecimal(fixo) : null,
              }), "Modelo salvo. Os painéis dos representantes já passam a mostrar a comissão.")}>
              Salvar modelo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- representantes ---------- */}
      <Card>
        <CardHeader className="border-b py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Representantes</CardTitle>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNovo((n) => !n)}>
              <Plus className="h-4 w-4" /> {novo ? "Fechar" : "Novo representante"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {novo && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome *"
                className="h-9 rounded-md border bg-background px-3 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
                className="h-9 rounded-md border bg-background px-3 text-sm" />
              <div className="flex gap-2">
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="WhatsApp"
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
                <Button size="sm" disabled={pendente}
                  onClick={() => agir(async () => {
                    const r = await criarRepresentante({ nome, email, telefone });
                    if (!r.error) { setNome(""); setEmail(""); setTelefone(""); setNovo(false); }
                    return r;
                  }, "Representante cadastrado com link próprio.")}>
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {representantes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum representante ainda. Cadastre o primeiro e mande o link de convite para ele.
            </p>
          )}

          {representantes.map((r) => (
            <div key={r.id} className={`grid gap-2 rounded-lg border p-3 ${r.ativo ? "" : "opacity-60"}`}>
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{r.nome}</strong>
                  {r.principal && <Badge><Crown className="mr-1 h-3 w-3" /> principal</Badge>}
                  {!r.ativo && <Badge variant="outline">inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.ativas} loja(s) ativa(s) · {brl(r.mrr)}/mês
                  {r.email && <span className="ml-2 break-all">{r.email}</span>}
                </p>
              </div>

              <div className="grid gap-3 text-xs">
                <div className="grid gap-1">
                  <span className="text-muted-foreground">
                    Link de convite <span className="opacity-70">— mande para ele divulgar</span>
                  </span>
                  <code className="block break-all rounded bg-muted px-2 py-1.5">{r.convite}</code>
                  <div>
                    <Button size="sm" variant="outline" onClick={() => copiar(r.convite, `c-${r.id}`)}>
                      <Copy className="h-3.5 w-3.5" /> {copiado === `c-${r.id}` ? "copiado!" : "copiar convite"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-1">
                  <span className="text-muted-foreground">
                    Painel dele <span className="opacity-70">— a carteira, no celular</span>
                  </span>
                  <code className="block break-all rounded bg-muted px-2 py-1.5">{r.link}</code>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copiar(r.link, `p-${r.id}`)}>
                      <Copy className="h-3.5 w-3.5" /> {copiado === `p-${r.id}` ? "copiado!" : "copiar painel"}
                    </Button>
                    <a href={r.link} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-3.5 w-3.5" /> abrir
                      </Button>
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => definirRepresentantePrincipal(r.id, !r.principal))}>
                  {r.principal ? "Deixar de ser principal" : "Tornar principal"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => trocarLinkRepresentante(r.id), "Link trocado; o antigo parou de funcionar.")}>
                  <RefreshCw className="h-3.5 w-3.5" /> Trocar link
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                  onClick={() => agir(() => desativarRepresentante(r.id, !r.ativo))}>
                  {r.ativo ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- lojas e assinaturas ---------- */}
      <Card id="lojas" className="scroll-mt-24">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Lojas no sistema ({lojas.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Quem trouxe cada loja, quanto ela paga e em que situação está. Venda fechada por fora do
            link se atribui aqui.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 pt-4">
          {lojas.map((l) => {
            const s = SITUACAO_ASSINATURA[l.situacao] ?? { rotulo: l.situacao, tom: "outline" as const };
            const rep = representantes.find((r) => r.id === l.representanteId);
            const aberto = editando === l.empresaId;
            return (
              <div key={l.empresaId} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="min-w-0 break-words">{l.nome}</strong>
                    <Badge variant={s.tom}>{s.rotulo}</Badge>
                    {l.valor > 0 && <span className="text-xs text-muted-foreground">{brl(l.valor)}/mês</span>}
                  </div>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>desde {fmtDate(l.desde)}</span>
                    <span className={rep ? "" : "text-destructive"}>
                      {rep ? `venda de ${rep.nome}` : "sem representante"}
                    </span>
                  </p>
                  <Button size="sm" variant="ghost" className="justify-self-start"
                    onClick={() => {
                      if (aberto) { setEditando(null); return; }
                      setEditando(l.empresaId);
                      setValorLoja(l.valor ? String(l.valor).replace(".", ",") : "");
                      setSituacaoLoja(l.situacao);
                      setRepLoja(l.representanteId ?? "");
                    }}>
                    {aberto ? "Fechar" : "Editar assinatura"}
                  </Button>
                </div>

                {aberto && (
                  <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-4">
                    <label className="grid gap-1 text-xs">
                      Mensalidade
                      <input value={valorLoja} onChange={(e) => setValorLoja(e.target.value)}
                        placeholder="199,00" className="h-9 rounded-md border bg-background px-3 text-sm" />
                    </label>
                    <label className="grid gap-1 text-xs">
                      Situação
                      <select value={situacaoLoja} onChange={(e) => setSituacaoLoja(e.target.value)}
                        className="h-9 rounded-md border bg-background px-2 text-sm">
                        {Object.entries(SITUACAO_ASSINATURA).map(([k, v]) => (
                          <option key={k} value={k}>{v.rotulo}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs">
                      Representante
                      <select value={repLoja} onChange={(e) => setRepLoja(e.target.value)}
                        className="h-9 rounded-md border bg-background px-2 text-sm">
                        <option value="">— sem representante —</option>
                        {representantes.map((r) => (
                          <option key={r.id} value={r.id}>{r.nome}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <Button size="sm" disabled={pendente}
                        onClick={() => agir(async () => {
                          const r = await salvarAssinatura({
                            empresaId: l.empresaId,
                            representanteId: repLoja || null,
                            valor: parseDecimal(valorLoja),
                            situacao: situacaoLoja,
                            plano: null,
                          });
                          if (!r.error) setEditando(null);
                          return r;
                        }, "Assinatura atualizada.")}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

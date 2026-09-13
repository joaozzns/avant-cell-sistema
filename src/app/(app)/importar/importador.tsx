"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, XCircle,
  CopyMinus, ArrowLeft, Loader2, Package, Users, Truck, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CAMPOS, TIPOS, chaveDuplicidade, lerCsv, mapearColunas, modeloCsv, validarLinha,
  type Tipo, type LinhaValidada,
} from "@/lib/importacao";
import { importarLote, type ResultadoLinha, type LinhaEnviada } from "./actions";

const ICONES: Record<Tipo, typeof Package> = {
  produtos: Package, clientes: Users, fornecedores: Truck, aparelhos: Smartphone,
};
const DESTINO: Record<Tipo, { href: string; label: string }> = {
  produtos: { href: "/estoque", label: "Ver catálogo" },
  clientes: { href: "/clientes", label: "Ver clientes" },
  fornecedores: { href: "/compras/fornecedores", label: "Ver fornecedores" },
  aparelhos: { href: "/estoque/aparelhos", label: "Ver aparelhos" },
};
const LOTE = 50;
const MAX_LINHAS = 20000;

type Celula = string | number | boolean | Date | null;
type Previa = LinhaValidada & { linha: number; bruto: LinhaEnviada["bruto"]; repetidaDe?: number };

function baixar(nome: string, conteudo: string) {
  /* BOM para o Excel abrir acentos corretamente */
  const url = URL.createObjectURL(new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* planilhas exportadas no Windows costumam vir em Windows-1252, nao UTF-8 */
async function lerTexto(arquivo: File) {
  const buf = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function paraEnvio(c: Celula): string | number | null {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "boolean") return c ? "sim" : "não";
  return c;
}

export function Importador() {
  const [tipo, setTipo] = useState<Tipo>("produtos");
  const [etapa, setEtapa] = useState<"escolher" | "revisar" | "importando" | "concluido">("escolher");
  const [arquivo, setArquivo] = useState<string>("");
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Celula[][]>([]);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [atualizar, setAtualizar] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "erros" | "avisos">("todas");
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<ResultadoLinha[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const campos = CAMPOS[tipo];

  /* impede fechar a aba no meio da gravacao */
  useEffect(() => {
    if (etapa !== "importando") return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [etapa]);

  async function carregar(f: File) {
    setFalha(null);
    setLendo(true);
    try {
      let tabela: Celula[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const abas = await readXlsxFile(f);
        tabela = (abas[0]?.data ?? []) as Celula[][];
      } else if (/\.xls$/i.test(f.name)) {
        throw new Error("O formato .xls antigo não é suportado. No Excel, use Salvar como → .xlsx ou CSV.");
      } else {
        tabela = lerCsv(await lerTexto(f));
      }
      const utilizaveis = tabela.filter((l) => l.some((c) => c !== null && String(c).trim() !== ""));
      if (utilizaveis.length < 2) throw new Error("A planilha precisa de uma linha de cabeçalho e ao menos uma linha de dados.");
      if (utilizaveis.length - 1 > MAX_LINHAS) {
        throw new Error(`A planilha tem ${utilizaveis.length - 1} linhas. Divida em arquivos de até ${MAX_LINHAS}.`);
      }
      const cab = utilizaveis[0].map((c) => String(c ?? "").trim());
      setCabecalho(cab);
      setLinhas(utilizaveis.slice(1));
      setMapa(mapearColunas(cab, tipo));
      setArquivo(f.name);
      setFiltro("todas");
      setEtapa("revisar");
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (cabecalho.length) setMapa(mapearColunas(cabecalho, t));
    if (t === "aparelhos") setAtualizar(false);
  }

  /* validacao local: a mesma regra que o servidor aplica, para mostrar antes de gravar */
  const previa = useMemo<Previa[]>(() => {
    if (etapa === "escolher") return [];
    const vistas = new Map<string, number>();
    return linhas.map((l, i) => {
      const bruto: LinhaEnviada["bruto"] = {};
      for (const c of campos) {
        const idx = mapa[c.chave];
        bruto[c.chave] = idx === undefined || idx < 0 ? null : paraEnvio(l[idx] ?? null);
      }
      const numero = i + 2; /* linha como aparece na planilha: 1 e o cabecalho */
      const v = validarLinha(tipo, bruto);
      const chave = v.erros.length ? null : chaveDuplicidade(tipo, v.dados);
      const anterior = chave ? vistas.get(chave) : undefined;
      if (chave && anterior === undefined) vistas.set(chave, numero);
      return { ...v, linha: numero, bruto, repetidaDe: anterior };
    });
  }, [linhas, mapa, tipo, campos, etapa]);

  const faltando = campos.filter((c) => c.obrigatorio && (mapa[c.chave] ?? -1) < 0);
  const contagem = useMemo(() => {
    let prontas = 0, avisos = 0, erros = 0, repetidas = 0;
    for (const p of previa) {
      if (p.erros.length) erros++;
      else if (p.repetidaDe) repetidas++;
      else { prontas++; if (p.avisos.length) avisos++; }
    }
    return { prontas, avisos, erros, repetidas };
  }, [previa]);

  const visiveis = previa.filter((p) =>
    filtro === "erros" ? p.erros.length > 0 || p.repetidaDe : filtro === "avisos" ? p.avisos.length > 0 && !p.erros.length : true
  );

  async function importar() {
    const enviar = previa.filter((p) => !p.erros.length && !p.repetidaDe);
    const locais: ResultadoLinha[] = previa
      .filter((p) => p.erros.length || p.repetidaDe)
      .map((p) =>
        p.erros.length
          ? { linha: p.linha, status: "erro", mensagem: p.erros.join(" ") }
          : { linha: p.linha, status: "ignorado", mensagem: `Repetida na planilha (igual à linha ${p.repetidaDe}).` }
      );

    setEtapa("importando");
    setProgresso(0);
    setFalha(null);
    const acumulado: ResultadoLinha[] = [...locais];

    for (let i = 0; i < enviar.length; i += LOTE) {
      const lote = enviar.slice(i, i + LOTE).map((p) => ({ linha: p.linha, bruto: p.bruto }));
      try {
        const resp = await importarLote(tipo, lote, atualizar);
        if (resp.erroGeral) {
          setFalha(resp.erroGeral);
          for (const p of enviar.slice(i)) {
            acumulado.push({ linha: p.linha, status: "erro", mensagem: "Não enviada: " + resp.erroGeral });
          }
          break;
        }
        acumulado.push(...resp.resultados);
      } catch {
        /* queda de conexao: o lote atual fica marcado, o usuario pode reenviar so ele */
        for (const p of enviar.slice(i, i + LOTE)) {
          acumulado.push({ linha: p.linha, status: "erro", mensagem: "Falha de conexão ao enviar este lote. Importe novamente: registros já gravados serão ignorados." });
        }
      }
      setProgresso(Math.min(enviar.length, i + LOTE));
    }

    acumulado.sort((a, b) => a.linha - b.linha);
    setResultados(acumulado);
    setEtapa("concluido");
  }

  function recomecar() {
    setEtapa("escolher");
    setArquivo("");
    setCabecalho([]);
    setLinhas([]);
    setMapa({});
    setResultados([]);
    setFalha(null);
    setProgresso(0);
  }

  /* ------------------------------------------------------------------ telas */

  if (etapa === "importando") {
    const total = contagem.prontas;
    const pct = total ? Math.round((progresso / total) * 100) : 100;
    return (
      <Card>
        <CardContent className="grid place-items-center gap-4 py-14 text-center">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <div>
            <p className="text-lg font-semibold">Importando {arquivo}</p>
            <p className="text-sm text-muted-foreground">
              {progresso} de {total} registros · não feche esta aba
            </p>
          </div>
          <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (etapa === "concluido") {
    const soma = (s: ResultadoLinha["status"]) => resultados.filter((r) => r.status === s).length;
    const problemas = resultados.filter((r) => r.status !== "criado" || r.mensagem);
    return (
      <div className="grid gap-5">
        {falha && <Alerta tom="erro">{falha}</Alerta>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Resumo icone={CheckCircle2} tom="sucesso" valor={soma("criado")} rotulo="criados" />
          <Resumo icone={CheckCircle2} tom="primario" valor={soma("atualizado")} rotulo="atualizados" />
          <Resumo icone={CopyMinus} tom="neutro" valor={soma("ignorado")} rotulo="ignorados" />
          <Resumo icone={XCircle} tom="erro" valor={soma("erro")} rotulo="com erro" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={DESTINO[tipo].href} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110">
            {DESTINO[tipo].label}
          </Link>
          <Button variant="outline" onClick={recomecar}>Nova importação</Button>
          {problemas.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                baixar(
                  `relatorio-importacao-${tipo}.csv`,
                  ["Linha;Situação;Detalhe", ...resultados.map((r) =>
                    `${r.linha};${r.status};"${(r.mensagem ?? "").replace(/"/g, '""')}"`)].join("\r\n")
                )
              }
            >
              <Download className="h-4 w-4" /> Baixar relatório
            </Button>
          )}
        </div>

        {problemas.length > 0 && (
          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Linhas que merecem atenção</CardTitle>
              <CardDescription>Ignoradas, com erro ou gravadas com observação.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[480px] overflow-auto p-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2.5 font-medium">Linha</th><th className="px-4 py-2.5 font-medium">Situação</th><th className="px-4 py-2.5 font-medium">Detalhe</th></tr>
                </thead>
                <tbody>
                  {problemas.map((r) => (
                    <tr key={r.linha} className="border-t">
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.linha}</td>
                      <td className="px-4 py-2.5"><Situacao status={r.status} /></td>
                      <td className="px-4 py-2.5">{r.mensagem ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {/* 1. tipo */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TIPOS.map((t) => {
          const Icone = ICONES[t.tipo];
          const ativo = tipo === t.tipo;
          return (
            <button
              key={t.tipo}
              type="button"
              onClick={() => trocarTipo(t.tipo)}
              aria-pressed={ativo}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                ativo ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"
              )}
            >
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", ativo ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                <Icone className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{t.titulo}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{t.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>

      {falha && <Alerta tom="erro">{falha}</Alerta>}

      {etapa === "escolher" && (
        <Card>
          <CardContent className="grid gap-5 pt-6">
            <label
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) carregar(f);
              }}
              className={cn(
                "grid cursor-pointer place-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                arrastando ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-muted/40"
              )}
            >
              {lendo ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Upload className="h-9 w-9 text-primary" />}
              <div>
                <p className="font-semibold">{lendo ? "Lendo a planilha..." : "Arraste a planilha aqui ou clique para escolher"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx) ou CSV, exportados do seu sistema anterior.</p>
              </div>
              <input
                ref={entrada}
                type="file"
                accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={lendo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) carregar(f);
                }}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Não sabe como montar? Baixe o modelo, cole seus dados e envie. As colunas também são reconhecidas pelos nomes que outros sistemas usam.
              </p>
              <Button variant="outline" size="sm" onClick={() => baixar(`modelo-${tipo}.csv`, modeloCsv(tipo))}>
                <Download className="h-4 w-4" /> Planilha modelo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {etapa === "revisar" && (
        <>
          {/* 2. colunas */}
          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> {arquivo}
              </CardTitle>
              <CardDescription>
                {linhas.length} linha(s) · confira de qual coluna vem cada informação
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 pt-5 sm:grid-cols-2 xl:grid-cols-3">
              {campos.map((c) => {
                const idx = mapa[c.chave] ?? -1;
                const amostra = idx >= 0 ? linhas.find((l) => l[idx] !== null && String(l[idx]).trim() !== "")?.[idx] : null;
                return (
                  <div key={c.chave} className="grid gap-1">
                    <label htmlFor={`col-${c.chave}`} className="text-xs font-medium">
                      {c.rotulo}{c.obrigatorio && <span className="text-destructive"> *</span>}
                    </label>
                    <select
                      id={`col-${c.chave}`}
                      value={idx}
                      onChange={(e) => setMapa((m) => ({ ...m, [c.chave]: Number(e.target.value) }))}
                      className={cn(
                        "h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-ring",
                        c.obrigatorio && idx < 0 && "border-destructive"
                      )}
                    >
                      <option value={-1}>— não importar —</option>
                      {cabecalho.map((h, i) => (
                        <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                      ))}
                    </select>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {idx >= 0 ? `ex.: ${amostra instanceof Date ? amostra.toLocaleDateString("pt-BR") : amostra ?? "(vazia)"}` : " "}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {faltando.length > 0 && (
            <Alerta tom="erro">
              Escolha a coluna de: {faltando.map((c) => c.rotulo).join(", ")}.
            </Alerta>
          )}

          {/* 3. previa */}
          <Card>
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Prévia</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {([
                  ["todas", `Todas (${previa.length})`],
                  ["erros", `Não serão importadas (${contagem.erros + contagem.repetidas})`],
                  ["avisos", `Com observação (${contagem.avisos})`],
                ] as const).map(([f, rotulo]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltro(f)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-medium transition-colors",
                      filtro === f ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50"
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="max-h-[440px] overflow-auto p-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Linha</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                    {campos.filter((c) => (mapa[c.chave] ?? -1) >= 0).slice(0, 5).map((c) => (
                      <th key={c.chave} className="whitespace-nowrap px-4 py-2.5 font-medium">{c.rotulo}</th>
                    ))}
                    <th className="px-4 py-2.5 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.slice(0, 200).map((p) => (
                    <tr key={p.linha} className="border-t align-top">
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{p.linha}</td>
                      <td className="px-4 py-2.5">
                        <Situacao status={p.erros.length ? "erro" : p.repetidaDe ? "ignorado" : p.avisos.length ? "aviso" : "pronta"} />
                      </td>
                      {campos.filter((c) => (mapa[c.chave] ?? -1) >= 0).slice(0, 5).map((c) => (
                        <td key={c.chave} className="max-w-[220px] truncate px-4 py-2.5">{p.bruto[c.chave] ?? <span className="text-muted-foreground">—</span>}</td>
                      ))}
                      <td className="min-w-[240px] px-4 py-2.5 text-xs">
                        {[...p.erros, ...(p.repetidaDe ? [`Repetida (igual à linha ${p.repetidaDe}).`] : []), ...p.avisos].join(" ") || <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visiveis.length > 200 && (
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                  Mostrando 200 de {visiveis.length}. Todas serão processadas.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 4. confirmar */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <div className="grid gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{contagem.prontas}</span> registro(s) prontos para importar
                  {contagem.erros + contagem.repetidas > 0 && (
                    <span className="text-muted-foreground"> · {contagem.erros + contagem.repetidas} ficarão de fora</span>
                  )}
                </p>
                {tipo !== "aparelhos" ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                    Atualizar cadastros que já existem (colunas vazias não apagam dados)
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">IMEIs já cadastrados são ignorados; aparelhos existentes não são alterados.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={recomecar}>
                  <ArrowLeft className="h-4 w-4" /> Trocar arquivo
                </Button>
                <Button onClick={importar} disabled={faltando.length > 0 || contagem.prontas === 0}>
                  <Upload className="h-4 w-4" /> Importar {contagem.prontas}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Alerta({ tom, children }: { tom: "erro"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm", tom === "erro" && "border-destructive/30 bg-destructive/8 text-destructive")}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Situacao({ status }: { status: ResultadoLinha["status"] | "pronta" | "aviso" }) {
  const mapa = {
    pronta: ["Pronta", "bg-success/12 text-success"],
    criado: ["Criado", "bg-success/12 text-success"],
    atualizado: ["Atualizado", "bg-primary/12 text-primary"],
    aviso: ["Com observação", "bg-amber-500/15 text-amber-700 dark:text-amber-400"],
    ignorado: ["Ignorada", "bg-muted text-muted-foreground"],
    erro: ["Erro", "bg-destructive/12 text-destructive"],
  } as const;
  const [rotulo, cls] = mapa[status];
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{rotulo}</span>;
}

function Resumo({ icone: Icone, tom, valor, rotulo }: { icone: typeof CheckCircle2; tom: "sucesso" | "primario" | "neutro" | "erro"; valor: number; rotulo: string }) {
  const cores = { sucesso: "text-success", primario: "text-primary", neutro: "text-muted-foreground", erro: "text-destructive" };
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <Icone className={cn("h-7 w-7 shrink-0", cores[tom])} />
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { brl, parseDecimal } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buscarClientes, buscarProdutos, criarReserva, unidadesDisponiveis,
} from "../actions";

type Cliente = { id: string; nome: string; documento: string | null; telefone: string | null };
type Produto = { id: string; nome: string; preco: number; comImei: boolean; livre: number };
type Unidade = { id: string; imei: string; cor: string; capacidade: string; preco: number; condicao: string };

const FORMAS = [
  { valor: "cash", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "debit", rotulo: "Débito" },
  { valor: "credit", rotulo: "Crédito" },
];

/* Sugestão de prazo: a loja não pode segurar aparelho para sempre. */
function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function FormReserva() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [buscaProduto, setBuscaProduto] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produto, setProduto] = useState<Produto | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidade, setUnidade] = useState<Unidade | null>(null);

  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [sinal, setSinal] = useState("");
  const [forma, setForma] = useState("cash");
  const [politica, setPolitica] = useState("Sinal vira crédito na loja se a reserva não for retirada.");
  const [prazo, setPrazo] = useState(emDias(7));

  async function procurarCliente(t: string) {
    setBuscaCliente(t);
    setClientes(t.trim().length >= 2 ? await buscarClientes(t) : []);
  }

  async function procurarProduto(t: string) {
    setBuscaProduto(t);
    setProdutos(t.trim().length >= 2 ? await buscarProdutos(t) : []);
  }

  async function escolherProduto(p: Produto) {
    setProduto(p); setProdutos([]); setBuscaProduto(p.nome); setUnidade(null);
    if (!preco && p.preco) setPreco(String(p.preco).replace(".", ","));
    setUnidades(p.comImei ? await unidadesDisponiveis(p.id) : []);
  }

  function salvar() {
    setErro("");
    if (!cliente) { setErro("Escolha o cliente: reserva sem dono não existe."); return; }
    if (!produto && !descricao.trim()) {
      setErro("Escolha o produto ou descreva o que o cliente quer encomendar.");
      return;
    }
    if (produto?.comImei && unidades.length > 0 && !unidade) {
      setErro("Escolha qual aparelho (IMEI) fica guardado — senão ele continua à venda para outra pessoa.");
      return;
    }
    iniciar(async () => {
      const r = await criarReserva({
        clienteId: cliente.id,
        produtoId: produto?.id ?? null,
        unidadeId: unidade?.id ?? null,
        descricao: descricao.trim(),
        precoCombinado: preco ? parseDecimal(preco) : null,
        sinal: sinal ? parseDecimal(sinal) : 0,
        formaSinal: forma,
        politicaSinal: politica.trim(),
        prazo: prazo || null,
      });
      if (r.error) { setErro(r.error); return; }
      router.push("/pdv/reservas");
      router.refresh();
    });
  }

  const encomenda = Boolean(produto && !unidade && produto.livre <= 0) || (!produto && !!descricao);

  return (
    <div className="grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova reserva</h1>
        <p className="text-sm text-muted-foreground">
          O produto sai da vitrine no nome do cliente. Se não tem no estoque, vira encomenda.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">1 · Cliente</CardTitle></CardHeader>
        <CardContent className="grid gap-2 pt-4">
          {cliente ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <strong>{cliente.nome}</strong>
              {cliente.documento && <span className="text-muted-foreground">{cliente.documento}</span>}
              {cliente.telefone && <span className="text-muted-foreground">{cliente.telefone}</span>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setCliente(null)}>Trocar</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={buscaCliente} onChange={(e) => procurarCliente(e.target.value)}
                  placeholder="Nome ou CPF do cliente"
                  className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm" />
              </div>
              {clientes.map((c) => (
                <button key={c.id} type="button" onClick={() => { setCliente(c); setClientes([]); }}
                  className="rounded-lg border p-2.5 text-left text-sm hover:bg-muted">
                  {c.nome}
                  <span className="block text-xs text-muted-foreground">
                    {c.documento ?? "sem documento"}{c.telefone && ` · ${c.telefone}`}
                  </span>
                </button>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">2 · O que está sendo reservado</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={buscaProduto} onChange={(e) => { setProduto(null); procurarProduto(e.target.value); }}
              placeholder="Buscar produto no catálogo"
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm" />
          </div>
          {produtos.map((p) => (
            <button key={p.id} type="button" onClick={() => escolherProduto(p)}
              className="rounded-lg border p-2.5 text-left text-sm hover:bg-muted">
              {p.nome}
              <span className="block text-xs text-muted-foreground">
                {brl(p.preco)} · {p.livre > 0 ? `${p.livre} livre(s) nesta loja` : "sem saldo livre — vira encomenda"}
              </span>
            </button>
          ))}

          {produto && unidades.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Qual aparelho guardar?</p>
              {unidades.map((u) => (
                <label key={u.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${unidade?.id === u.id ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="unidade" checked={unidade?.id === u.id}
                    onChange={() => setUnidade(u)} />
                  <span>
                    <span className="font-mono">{u.imei}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[u.cor, u.capacidade, u.condicao].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Sem escolher, a reserva segura a quantidade, não o aparelho específico.
              </p>
            </div>
          )}

          <label className="grid gap-1 text-sm">
            Encomenda (quando não está no catálogo)
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: iPhone 15 Pro Max 512GB titânio natural"
              className="h-9 rounded-md border bg-background px-3" />
          </label>

          {encomenda && (
            <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Não há saldo livre: a reserva entra como <strong>encomenda</strong> e você acompanha a chegada
              na tela de reservas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">3 · Sinal e prazo</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Preço combinado
              <input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00"
                className="h-9 rounded-md border bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">
              Sinal recebido
              <input value={sinal} onChange={(e) => setSinal(e.target.value)} placeholder="0,00"
                className="h-9 rounded-md border bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">
              Retirar até
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)}
                className="h-9 rounded-md border bg-background px-2" />
            </label>
          </div>

          {sinal && parseDecimal(sinal) > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {FORMAS.map((f) => (
                  <button key={f.valor} type="button" onClick={() => setForma(f.valor)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${forma === f.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {f.rotulo}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                O sinal entra como crédito do cliente: no dia da retirada o PDV abate {brl(parseDecimal(sinal))} da venda.
                {forma === "cash" && " Em dinheiro, entra no seu caixa aberto."}
              </p>
            </>
          )}

          <label className="grid gap-1 text-sm">
            O que foi combinado sobre o sinal
            <input value={politica} onChange={(e) => setPolitica(e.target.value)}
              className="h-9 rounded-md border bg-background px-3" />
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Registrando…" : "Registrar reserva"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/pdv/reservas")}>Cancelar</Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}

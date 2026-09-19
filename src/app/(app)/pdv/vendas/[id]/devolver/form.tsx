"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { devolverVenda } from "./actions";

export type ItemVendido = {
  id: string;
  nome: string;
  imei: string | null;
  qtd: number;
  devolvido: number;
  valorUnitario: number;
};

const MOTIVOS = [
  { valor: "regret", rotulo: "Arrependimento (7 dias)" },
  { valor: "defect", rotulo: "Defeito" },
  { valor: "wrong_item", rotulo: "Produto errado" },
  { valor: "warranty", rotulo: "Garantia" },
];

const DESTINOS = [
  { valor: "stock", rotulo: "Volta para o estoque" },
  { valor: "damage", rotulo: "Avariado (não vende)" },
  { valor: "supplier_warranty", rotulo: "Garantia do fornecedor" },
  { valor: "os", rotulo: "Vai para a assistência" },
];

const REEMBOLSOS = [
  { valor: "store_credit", rotulo: "Crédito na loja", ajuda: "Vira saldo para o cliente usar em outra compra — é assim que se faz uma troca." },
  { valor: "cash", rotulo: "Dinheiro", ajuda: "Sai do seu caixa aberto." },
  { valor: "pix", rotulo: "Pix", ajuda: "Registra a devolução; o Pix é feito fora do sistema." },
  { valor: "credit", rotulo: "Estorno no cartão", ajuda: "Registra a devolução; o estorno é feito na maquininha." },
];

export function FormDevolucao({
  vendaId, numero, cliente, itens,
}: {
  vendaId: string;
  numero: number;
  cliente: string | null;
  itens: ItemVendido[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [motivo, setMotivo] = useState("regret");
  const [reembolso, setReembolso] = useState(cliente ? "store_credit" : "cash");
  const [obs, setObs] = useState("");
  const [sel, setSel] = useState<Record<string, { qtd: number; destino: string }>>({});

  const disponiveis = itens.filter((i) => i.qtd - i.devolvido > 0);

  const total = useMemo(
    () => Object.entries(sel).reduce((s, [id, v]) => {
      const it = itens.find((i) => i.id === id);
      return s + (it ? Math.round(it.valorUnitario * v.qtd * 100) / 100 : 0);
    }, 0),
    [sel, itens],
  );

  function alternar(item: ItemVendido) {
    setSel((atual) => {
      const novo = { ...atual };
      if (novo[item.id]) delete novo[item.id];
      else novo[item.id] = { qtd: item.qtd - item.devolvido, destino: motivo === "defect" ? "damage" : "stock" };
      return novo;
    });
  }

  function confirmar() {
    setErro("");
    const itensEscolhidos = Object.entries(sel).map(([saleItemId, v]) => ({
      saleItemId, qty: v.qtd, destination: v.destino,
    }));
    if (!itensEscolhidos.length) { setErro("Marque o item que o cliente está devolvendo."); return; }
    if (reembolso === "store_credit" && !cliente) {
      setErro("Crédito na loja precisa de cliente identificado na venda. Escolha outra forma de reembolso.");
      return;
    }
    iniciar(async () => {
      const r = await devolverVenda({ saleId: vendaId, reason: motivo, refundKind: reembolso, notes: obs, items: itensEscolhidos });
      if (r.error) { setErro(r.error); return; }
      router.push(`/pdv/vendas/${vendaId}?devolucao=ok`);
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Devolução / troca · Venda #{numero}</h1>
        <p className="text-sm text-muted-foreground">
          {cliente ? `Cliente: ${cliente}` : "Venda de balcão (sem cliente identificado)"}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1 · O que está voltando</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {disponiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">Todos os itens desta venda já foram devolvidos.</p>
          )}
          {disponiveis.map((it) => {
            const s = sel[it.id];
            const resta = it.qtd - it.devolvido;
            return (
              <div key={it.id} className={`rounded-lg border p-3 ${s ? "border-primary bg-primary/5" : ""}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={!!s} onChange={() => alternar(it)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{it.nome}</span>
                    {it.imei && <span className="block text-xs text-muted-foreground">IMEI {it.imei}</span>}
                    <span className="block text-xs text-muted-foreground">
                      {brl(it.valorUnitario)} cada · {resta} de {it.qtd} ainda na venda
                    </span>
                  </span>
                </label>
                {s && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                    {resta > 1 && (
                      <label className="flex items-center gap-2 text-sm">
                        Qtd
                        <input type="number" min={1} max={resta} value={s.qtd}
                          onChange={(e) => {
                            const q = Math.min(Math.max(1, Number(e.target.value) || 1), resta);
                            setSel((a) => ({ ...a, [it.id]: { ...a[it.id], qtd: q } }));
                          }}
                          className="h-8 w-16 rounded-md border bg-background px-2" />
                      </label>
                    )}
                    <select value={s.destino}
                      onChange={(e) => setSel((a) => ({ ...a, [it.id]: { ...a[it.id], destino: e.target.value } }))}
                      className="h-8 rounded-md border bg-background px-2 text-sm">
                      {DESTINOS.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Motivo e reembolso</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <button key={m.valor} type="button" onClick={() => setMotivo(m.valor)}
                className={`rounded-md border px-3 py-1.5 text-sm ${motivo === m.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {m.rotulo}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            {REEMBOLSOS.map((r) => {
              const bloqueado = r.valor === "store_credit" && !cliente;
              return (
                <label key={r.valor}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${reembolso === r.valor ? "border-primary bg-primary/5" : ""} ${bloqueado ? "opacity-50" : "cursor-pointer"}`}>
                  <input type="radio" name="reembolso" className="mt-1" disabled={bloqueado}
                    checked={reembolso === r.valor} onChange={() => setReembolso(r.valor)} />
                  <span>
                    <span className="font-medium">{r.rotulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {bloqueado ? "Precisa de cliente identificado na venda." : r.ajuda}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
            placeholder="Observação (opcional): estado do produto, o que o cliente relatou…"
            className="rounded-md border bg-background px-3 py-2 text-sm" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
        <div>
          <div className="text-xs text-muted-foreground">Valor a devolver</div>
          <div className="text-2xl font-bold">{brl(total)}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/pdv/vendas/${vendaId}`)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={pendente || total <= 0}>
            {pendente ? "Registrando…" : "Confirmar devolução"}
          </Button>
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}

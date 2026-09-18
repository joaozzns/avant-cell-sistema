"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  searchProducts, searchCustomers, completeSale,
  type CartItem, type PaymentEntry,
} from "./actions";
import { brl } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type SearchResult = Awaited<ReturnType<typeof searchProducts>>;
type Customer = { id: string; name: string; cpf_cnpj: string | null; phone: string | null };

const PAYMENT_KINDS = [
  { kind: "cash", label: "Dinheiro" },
  { kind: "pix", label: "Pix" },
  { kind: "debit", label: "Débito" },
  { kind: "credit", label: "Crédito à vista" },
  { kind: "credit_installments", label: "Crédito parcelado" },
  { kind: "credit_plan", label: "Crediário" },
];

export function PdvClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult>({ products: [], units: [] });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custTerm, setCustTerm] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [payKind, setPayKind] = useState("cash");
  const [payAmount, setPayAmount] = useState("");
  const [installments, setInstallments] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ number: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0);
  const total = Math.max(subtotal - discount, 0);
  const paid = payments.reduce((s, p) => s + p.amount - (p.changeGiven ?? 0), 0);
  const remaining = Math.round((total - paid) * 100) / 100;

  // Busca com debounce
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults({ products: [], units: [] });
      return;
    }
    const h = setTimeout(() => {
      startTransition(async () => setResults(await searchProducts(term)));
    }, 250);
    return () => clearTimeout(h);
  }, [term]);

  useEffect(() => {
    if (custTerm.trim().length < 2) { setCustResults([]); return; }
    const h = setTimeout(() => {
      startTransition(async () => setCustResults(await searchCustomers(custTerm)));
    }, 250);
    return () => clearTimeout(h);
  }, [custTerm]);

  // Atalhos: F2 produto · F4 cliente · F8 pagamento · ESC cancela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); setShowCustomer(true); }
      if (e.key === "F8" && items.length > 0) { e.preventDefault(); openPayment(); }
      if (e.key === "Escape") { setShowPayment(false); setShowCustomer(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addProduct = useCallback((p: SearchResult["products"][number]) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === p.id && !i.unitId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { productId: p.id, name: p.name, qty: 1, unitPrice: p.price, discount: 0 }];
    });
    setTerm("");
    setResults({ products: [], units: [] });
    searchRef.current?.focus();
  }, []);

  const addUnit = useCallback((u: SearchResult["units"][number]) => {
    setItems((prev) => {
      if (prev.some((i) => i.unitId === u.unitId)) return prev;
      return [...prev, {
        productId: u.productId, unitId: u.unitId,
        name: `${u.name} · IMEI ${u.imei}`, qty: 1, unitPrice: u.price, discount: 0,
      }];
    });
    setTerm("");
    setResults({ products: [], units: [] });
  }, []);

  function openPayment() {
    setPayments([]);
    setPayAmount(total.toFixed(2).replace(".", ","));
    setError("");
    setShowPayment(true);
  }

  function addPayment() {
    const amount = Number(payAmount.replace(/\./g, "").replace(",", "."));
    if (!amount || amount <= 0) return;
    if (payKind === "credit_plan" && !customer) {
      setError("Crediário exige cliente vinculado à venda (F4).");
      return;
    }
    const change = payKind === "cash" && amount > remaining ? amount - remaining : 0;
    setPayments((prev) => [...prev, {
      kind: payKind, amount,
      installments: ["credit_installments", "credit_plan"].includes(payKind) ? installments : 1,
      changeGiven: change,
    }]);
    const newRemaining = Math.max(remaining - (amount - change), 0);
    setPayAmount(newRemaining > 0 ? newRemaining.toFixed(2).replace(".", ",") : "");
  }

  function finalize() {
    setError("");
    startTransition(async () => {
      const res = await completeSale({
        items, payments, customerId: customer?.id ?? null, discount,
      });
      if (res.error) { setError(res.error); return; }
      setDone({ number: res.number! });
      setItems([]); setPayments([]); setCustomer(null); setDiscount(0);
      setShowPayment(false);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Coluna principal */}
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">PDV</h1>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">F2 produto</Badge>
            <Badge variant="outline">F4 cliente</Badge>
            <Badge variant="outline">F8 pagamento</Badge>
          </div>
        </div>

        <div className="relative">
          <Input
            ref={searchRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar produto por nome, código, EAN ou IMEI…  (F2)"
            className="h-12 text-base"
          />
          {(results.products.length > 0 || results.units.length > 0) && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
              {results.units.map((u) => (
                <button key={u.unitId} onClick={() => addUnit(u)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted">
                  <span>
                    📱 {u.name}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{u.imei}</span>
                  </span>
                  <span className="font-medium">{brl(u.price)}</span>
                </button>
              ))}
              {results.products.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted">
                  <span>
                    {p.name}
                    {p.code && <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>}
                    {!p.isService && p.stock <= 0 && (
                      <Badge variant="destructive" className="ml-2">sem estoque</Badge>
                    )}
                  </span>
                  <span className="font-medium">{brl(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-lg border bg-background">
          {items.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              Carrinho vazio — bipe ou busque um produto para começar.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-2 py-2 text-center">Qtd.</th>
                  <th className="px-2 py-2 text-right">Unitário</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-4 py-2">{i.name}</td>
                    <td className="px-2 py-2 text-center">
                      {i.unitId ? 1 : (
                        <input
                          type="number" min={1} value={i.qty}
                          onChange={(e) => {
                            const qty = Math.max(1, Number(e.target.value));
                            setItems((prev) => prev.map((x, j) => j === idx ? { ...x, qty } : x));
                          }}
                          className="w-16 rounded border bg-transparent px-2 py-1 text-center"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">{brl(i.unitPrice)}</td>
                    <td className="px-2 py-2 text-right font-medium">
                      {brl(i.qty * i.unitPrice - i.discount)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remover item"
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Resumo lateral */}
      <div className="grid h-fit content-start gap-4 rounded-lg border bg-background p-4">
        <div>
          <p className="text-xs text-muted-foreground">Cliente (F4)</p>
          {customer ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">{customer.name}</span>
              <button onClick={() => setCustomer(null)} className="text-xs text-muted-foreground hover:text-destructive">
                remover
              </button>
            </div>
          ) : (
            <button onClick={() => setShowCustomer(true)} className="text-sm underline-offset-4 hover:underline">
              Venda no balcão · vincular cliente
            </button>
          )}
        </div>

        <div className="grid gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground">Desconto (R$)</span>
            <input
              inputMode="decimal"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value.replace(",", ".")) || 0)}
              className="w-24 rounded border bg-transparent px-2 py-1 text-right"
              placeholder="0,00"
            />
          </div>
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </div>

        <Button size="lg" disabled={items.length === 0} onClick={openPayment}>
          Pagamento (F8)
        </Button>
        <Link href="/pdv/caixa" className={buttonVariants({ variant: "outline" })}>
          Caixa
        </Link>
        <Link href="/pdv/vendas" className={buttonVariants({ variant: "ghost" })}>
          Vendas do dia
        </Link>
      </div>

      {/* Modal cliente */}
      <Dialog open={showCustomer} onOpenChange={setShowCustomer}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular cliente</DialogTitle></DialogHeader>
          <Input
            autoFocus value={custTerm}
            onChange={(e) => setCustTerm(e.target.value)}
            placeholder="Nome, CPF ou telefone…"
          />
          <div className="grid gap-1">
            {custResults.map((c) => (
              <button key={c.id}
                onClick={() => { setCustomer(c); setShowCustomer(false); setCustTerm(""); }}
                className="flex justify-between rounded border px-3 py-2 text-left text-sm hover:bg-muted">
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.cpf_cnpj ?? c.phone ?? ""}</span>
              </button>
            ))}
            {custTerm.length >= 2 && custResults.length === 0 && !pending && (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.{" "}
                <Link href="/clientes/novo" className="underline">Cadastrar</Link>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal pagamento */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pagamento — total {brl(total)}</DialogTitle></DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {PAYMENT_KINDS.map((k) => (
                <button key={k.kind} onClick={() => setPayKind(k.kind)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${payKind === k.kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {k.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Input
                inputMode="decimal" value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Valor"
                onKeyDown={(e) => e.key === "Enter" && addPayment()}
              />
              {["credit_installments", "credit_plan"].includes(payKind) && (
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
                  className="rounded-md border bg-transparent px-2 text-sm">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              )}
              <Button variant="secondary" onClick={addPayment}>Adicionar</Button>
            </div>

            {payments.length > 0 && (
              <div className="grid gap-1 text-sm">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between rounded border px-3 py-1.5">
                    <span>
                      {PAYMENT_KINDS.find((k) => k.kind === p.kind)?.label}
                      {(p.installments ?? 1) > 1 && ` ${p.installments}x`}
                      {(p.changeGiven ?? 0) > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          troco {brl(p.changeGiven!)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {brl(p.amount)}
                      <button onClick={() => setPayments((prev) => prev.filter((_, j) => j !== idx))}
                        className="text-muted-foreground hover:text-destructive">✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between border-t pt-2 font-medium">
              <span>{remaining > 0 ? "Falta" : "Pago"}</span>
              <span className={remaining > 0 ? "text-destructive" : "text-green-600"}>
                {remaining > 0 ? brl(remaining) : "✓"}
              </span>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button size="lg" disabled={remaining !== 0 || payments.length === 0 || pending} onClick={finalize}>
              {pending ? "Finalizando…" : "Finalizar venda (F9)"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação */}
      <Dialog open={done !== null} onOpenChange={() => setDone(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Venda #{done?.number} concluída ✓</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Estoque baixado e caixa atualizado. O carrinho está pronto para a próxima venda.
          </p>
          <Button onClick={() => { setDone(null); searchRef.current?.focus(); }}>
            Nova venda
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

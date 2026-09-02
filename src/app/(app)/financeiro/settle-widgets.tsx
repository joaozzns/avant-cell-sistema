"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleReceivable, settlePayable } from "./actions";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Account = { id: string; name: string };

export function SettleReceivableButton({
  id, description, balance, accounts,
}: { id: string; description: string; balance: number; accounts: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(balance.toFixed(2).replace(".", ","));
  const [interest, setInterest] = useState("");
  const [discount, setDiscount] = useState("");
  const [dest, setDest] = useState("");

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await settleReceivable({
        id,
        amount: Number(amount.replace(/\./g, "").replace(",", ".")) || 0,
        interest: Number(interest.replace(",", ".")) || 0,
        discount: Number(discount.replace(",", ".")) || 0,
        accountId: dest || null,
      });
      if (r.error) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Receber</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Receber — {description}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Saldo em aberto: {brl(balance)}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Valor</label>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Juros/multa</label>
                <Input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Desconto</label>
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Destino</label>
              <select value={dest} onChange={(e) => setDest(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-3 text-sm">
                <option value="">Caixa aberto (dinheiro no balcão)</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={pending}>
              {pending ? "Registrando…" : "Confirmar recebimento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SettlePayableButton({
  id, description, balance, accounts,
}: { id: string; description: string; balance: number; accounts: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(balance.toFixed(2).replace(".", ","));
  const [account, setAccount] = useState(accounts[0]?.id ?? "");

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await settlePayable({
        id,
        amount: Number(amount.replace(/\./g, "").replace(",", ".")) || 0,
        accountId: account,
      });
      if (r.error) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Pagar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pagar — {description}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Saldo: {brl(balance)}</p>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Valor</label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Conta de origem</label>
              <select value={account} onChange={(e) => setAccount(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-3 text-sm">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={pending || !account}>
              {pending ? "Registrando…" : "Confirmar pagamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

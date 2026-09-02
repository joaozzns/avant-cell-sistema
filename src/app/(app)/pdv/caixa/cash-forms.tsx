"use client";

import { useActionState } from "react";
import { openCash, closeCash, cashMove, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OpenCashForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(openCash, {});
  return (
    <form action={formAction} className="grid max-w-xs gap-3">
      <div className="grid gap-2">
        <Label htmlFor="opening_amount">Fundo de troco (R$)</Label>
        <Input id="opening_amount" name="opening_amount" inputMode="decimal" defaultValue="0" autoFocus />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Abrindo…" : "Abrir caixa"}
      </Button>
    </form>
  );
}

export function CloseCashForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(closeCash, {});
  return (
    <form action={formAction} className="grid max-w-sm gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="grid gap-2">
        <Label htmlFor="counted_cash">Dinheiro contado na gaveta (R$)</Label>
        <Input id="counted_cash" name="counted_cash" inputMode="decimal" required />
        <p className="text-xs text-muted-foreground">
          Fechamento cego: conte o dinheiro sem consultar o esperado.
          A diferença aparece depois de fechar.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="justification">Justificativa (se houver divergência)</Label>
        <Input id="justification" name="justification" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Fechando…" : "Fechar caixa"}
      </Button>
    </form>
  );
}

export function CashMoveForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cashMove, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Tipo</label>
        <select name="type" className="h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="withdrawal">Sangria (retirada)</option>
          <option value="supply">Suprimento (reforço)</option>
        </select>
      </div>
      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Valor (R$)</label>
        <Input name="amount" inputMode="decimal" className="w-28" />
      </div>
      <div className="grid min-w-52 flex-1 gap-1">
        <label className="text-xs text-muted-foreground">Motivo</label>
        <Input name="reason" placeholder="ex.: depósito no banco, troco…" />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Registrando…" : "Registrar"}
      </Button>
      {state?.ok && <span className="text-sm text-green-600">Registrado ✓</span>}
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelDocument } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CancelDocButton({ docId, number }: { docId: string; number: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await cancelDocument(docId, reason);
      if (r.error) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-destructive hover:underline">
        cancelar
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar nota nº {number}</DialogTitle></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Justificativa (mínimo 15 caracteres)" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
          <p className="text-xs text-muted-foreground">
            O cancelamento na SEFAZ tem prazo legal (em geral 30 minutos para NFC-e).
            Fora do prazo, emita nota de devolução.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

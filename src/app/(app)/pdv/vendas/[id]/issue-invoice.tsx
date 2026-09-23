"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueInvoiceForSale } from "@/app/(app)/fiscal/actions";
import { Button } from "@/components/ui/button";

/** Sem emissor contratado a "emissão" não chega na SEFAZ. Em vez de deixar o
 *  atendente clicar e ver "autorizada", o sistema para e explica o que vai
 *  acontecer — é a diferença entre treinar o fluxo e achar que emitiu nota. */
export function IssueInvoiceButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState<"nfce" | "nfe" | null>(null);

  function issue(kind: "nfce" | "nfe", confirmado = false) {
    setError("");
    startTransition(async () => {
      const r = await issueInvoiceForSale(saleId, kind, confirmado);
      if (r.precisaConfirmarSimulacao) { setConfirmar(kind); return; }
      if (r.error) { setError(r.error); setConfirmar(null); return; }
      setConfirmar(null);
      router.refresh();
    });
  }

  if (confirmar) {
    return (
      <div className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-sm">
          <strong className="text-destructive">Sua loja não tem emissor fiscal contratado.</strong>{" "}
          Isto <strong>não emite nota na SEFAZ</strong>: o sistema vai gerar uma nota simulada, com
          chave fictícia, só para você conhecer o fluxo. O cliente continua sem nota fiscal desta venda.
        </p>
        <p className="text-xs text-muted-foreground">
          Para emitir de verdade, contrate um emissor (Focus NFe, Nuvem Fiscal, PlugNotas) e cadastre
          o token em Fiscal → Configurações.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" disabled={pending}
            onClick={() => issue(confirmar, true)}>
            {pending ? "Gerando…" : "Entendi, gerar nota simulada"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmar(null)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => issue("nfce")}>
          {pending ? "Emitindo…" : "Emitir NFC-e (cupom)"}
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => issue("nfe")}>
          Emitir NF-e
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

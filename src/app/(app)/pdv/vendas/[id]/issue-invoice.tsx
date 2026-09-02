"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueInvoiceForSale } from "@/app/(app)/fiscal/actions";
import { Button } from "@/components/ui/button";

export function IssueInvoiceButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function issue(kind: "nfce" | "nfe") {
    setError("");
    startTransition(async () => {
      const r = await issueInvoiceForSale(saleId, kind);
      if (r.error) { setError(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicDecide } from "../actions";

export function DecideButtons({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function decide(approve: boolean) {
    setError("");
    startTransition(async () => {
      const r = await publicDecide(token, approve, approve ? undefined : reason);
      if (r.error) { setError(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      {!rejecting ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => decide(true)}
            disabled={pending}
            className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Enviando…" : "✓ Aprovar orçamento"}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="rounded-lg border border-red-300 px-4 py-3 font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Recusar
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por que está recusando? (opcional)"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => decide(false)}
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Confirmar recusa"}
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="rounded-lg border px-4 py-3 font-semibold"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-neutral-500">
        A decisão é registrada com data, hora e IP, e vale como aceite do serviço.
      </p>
    </div>
  );
}

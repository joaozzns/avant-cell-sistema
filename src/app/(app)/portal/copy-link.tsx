"use client";

import { useState } from "react";

export function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}/acompanhar/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
    >
      {copied ? "copiado ✓" : "copiar link"}
    </button>
  );
}

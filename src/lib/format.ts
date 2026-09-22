export function brl(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data em pt-BR.
 *
 *  Coluna `date` do Postgres chega como "2026-09-25", e `new Date` lê isso como
 *  meia-noite em UTC — que no Brasil ainda é dia 24. Vencimento, prazo e
 *  garantia apareciam um dia antes do que estão no banco, então data pura é
 *  formatada como texto mesmo, sem passar por fuso. */
export function fmtDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  if (typeof value === "string") {
    const so = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (so) return `${so[3]}/${so[2]}/${so[1]}`;
  }
  return new Date(value).toLocaleDateString("pt-BR");
}

export function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function parseDecimal(value: FormDataEntryValue | null): number {
  const s = String(value ?? "0").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Data (padrão: hoje) no fuso de quem está usando, em AAAA-MM-DD.
 *
 *  `toISOString()` devolve a data em UTC: das 21h à meia-noite, no Brasil, ela
 *  já é a de amanhã — e a loja via conta de amanhã marcada como vencida e o
 *  fechamento do dia pegando o dia errado. */
export function isoLocal(d: Date = new Date()) {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

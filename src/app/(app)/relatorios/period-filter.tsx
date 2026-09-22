import { isoLocal } from "@/lib/format";

export function PeriodFilter({ de, ate }: { de: string; ate: string }) {
  return (
    <form className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">De</label>
        <input type="date" name="de" defaultValue={de}
          className="h-9 rounded-md border bg-transparent px-3 text-sm" />
      </div>
      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Até</label>
        <input type="date" name="ate" defaultValue={ate}
          className="h-9 rounded-md border bg-transparent px-3 text-sm" />
      </div>
      <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
        Filtrar
      </button>
    </form>
  );
}

export function getPeriod(sp: { de?: string; ate?: string }) {
  const today = isoLocal();
  const monthStart = today.slice(0, 8) + "01";
  const de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : monthStart;
  const ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : today;
  const ateEnd = new Date(ate + "T00:00:00");
  ateEnd.setDate(ateEnd.getDate() + 1);
  return { de, ate, deIso: de, ateIso: isoLocal(ateEnd) };
}

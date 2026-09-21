import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormUsado } from "./form";

export default async function UsadoPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data: entradas } = await supabase
    .from("trade_ins")
    .select("id, seller_name, brand, model, imei, paid_amount, payment_kind, created_at, unit_id")
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aparelho usado na troca</h1>
          <p className="text-sm text-muted-foreground">
            Compra de aparelho do cliente. Ele entra no estoque com IMEI, pronto para revenda.
          </p>
        </div>
        <FormUsado companyId={companyId} />
      </div>

      <Card className="h-fit">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Últimas entradas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 pt-4 text-sm">
          {(entradas ?? []).length === 0 && (
            <p className="text-muted-foreground">Nenhum aparelho comprado ainda.</p>
          )}
          {(entradas ?? []).map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{e.model}</span>
                <span className="font-semibold">{brl(e.paid_amount)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                IMEI {e.imei} · de {e.seller_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(e.created_at)}
                {e.unit_id && (
                  <>
                    {" · "}
                    <Link href={`/estoque/aparelhos?imei=${e.imei}`} className="underline underline-offset-2">
                      ver no estoque
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

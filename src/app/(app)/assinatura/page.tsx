import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Assinatura" };

type Plano = {
  id: string;
  name: string;
  monthly_price: number;
  annual_price: number | null;
  mp_plan_id_monthly: string | null;
  mp_plan_id_annual: string | null;
};

const CHECKOUT = "https://www.mercadopago.com.br/subscriptions/checkout";

/** O link leva o id da empresa na referência externa: é por ele que o aviso
 *  de pagamento, quando voltar, encontra a loja que pagou. */
function linkDoPlano(planoMp: string, empresa: string) {
  return `${CHECKOUT}?preapproval_plan_id=${planoMp}&external_reference=${empresa}`;
}

export default async function AssinaturaPage() {
  const { supabase, companyId } = await getSessionContext();

  const [{ data: planos }, { data: situacao }, { data: atual }] = await Promise.all([
    supabase
      .from("saas_plans")
      .select("id, name, monthly_price, annual_price, mp_plan_id_monthly, mp_plan_id_annual")
      .eq("active", true)
      .order("sort_order"),
    /* sem parâmetro de propósito: responde sobre a empresa de quem
       pergunta, e não sobre uma que se peça pelo id */
    supabase.rpc("minha_assinatura"),
    supabase
      .from("subscriptions")
      .select("plan_id, status, charge_period, current_period_end, grace_until, charged_amount")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const s = (situacao ?? {}) as {
    situacao?: string; texto?: string; escreve?: boolean;
    plano?: string | null; vence_em?: string | null;
  };
  const lista = (planos ?? []) as unknown as Plano[];

  const aviso =
    s.situacao === "read_only" ? "destructive"
    : s.situacao === "past_due" ? "atencao"
    : "normal";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          O plano da sua loja, a cobrança e o vencimento.
        </p>
      </div>

      <Card
        className={
          aviso === "destructive" ? "border-destructive"
          : aviso === "atencao" ? "border-amber-500"
          : undefined
        }
      >
        <CardHeader><CardTitle className="text-base">Situação atual</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className={aviso === "destructive" ? "font-medium text-destructive" : "font-medium"}>
            {s.texto ?? "Sem assinatura registrada."}
          </p>
          {atual?.plan_id && (
            <p className="text-muted-foreground">
              Plano {s.plano ?? "—"} ·{" "}
              {atual.charge_period === "annual" ? "anual" : "mensal"}
              {atual.charged_amount ? ` · ${brl(Number(atual.charged_amount))}` : ""}
            </p>
          )}
          {s.vence_em && (
            <p className="text-muted-foreground">
              Próxima cobrança em {new Date(s.vence_em + "T12:00:00").toLocaleDateString("pt-BR")}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {lista.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="text-2xl font-semibold">{brl(Number(p.monthly_price))}</p>
                <p className="text-xs text-muted-foreground">por mês</p>
              </div>

              {p.mp_plan_id_monthly ? (
                <a
                  href={linkDoPlano(p.mp_plan_id_monthly, companyId)}
                  className={buttonVariants({ className: "w-full" })}
                >
                  Assinar mensal
                </a>
              ) : (
                <Button disabled className="w-full">Indisponível</Button>
              )}

              {p.annual_price && p.mp_plan_id_annual && (
                <>
                  <div className="border-t pt-3">
                    <p className="font-medium">{brl(Number(p.annual_price))} por ano</p>
                    <p className="text-xs text-muted-foreground">
                      equivale a {brl(Number(p.annual_price) / 12)} por mês, cobrado de uma vez
                    </p>
                  </div>
                  <a
                    href={linkDoPlano(p.mp_plan_id_annual, companyId)}
                    className={buttonVariants({ variant: "outline", className: "w-full" })}
                  >
                    Assinar anual
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        A cobrança é feita pelo Mercado Pago, no cartão de crédito, e renova
        sozinha. Para cancelar ou trocar o cartão, use a área de assinaturas da
        sua conta no Mercado Pago — aqui a gente só acompanha.
      </p>
    </div>
  );
}

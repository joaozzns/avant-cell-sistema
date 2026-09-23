import { createClient } from "@/lib/supabase/server";
import { brl } from "@/lib/format";
import { PainelVendedor } from "./painel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meu painel de vendas",
  description: "Acompanhe suas vendas, sua comissão e sua meta do mês.",
};

export default async function PaginaVendedor({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

  let dados: Record<string, unknown> | null = null;
  if (ehUuid) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("seller_panel", { p_token: token });
    dados = (data as Record<string, unknown> | null) ?? null;
  }

  if (!dados || dados.erro) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-3 p-6 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="text-xl font-bold">Link inválido</h1>
        <p className="text-sm text-muted-foreground">
          Este link não existe mais ou foi trocado. Peça o novo para o responsável da loja.
        </p>
      </main>
    );
  }

  return <PainelVendedor dados={dados as never} />;
}

export function formatar(v: number) {
  return brl(v);
}

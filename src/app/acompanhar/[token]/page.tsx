import { createClient } from "@/lib/supabase/server";
import { brl, fmtDate, fmtDateTime } from "@/lib/format";
import { DecideButtons } from "./decide-buttons";

export const dynamic = "force-dynamic";

const STATUS_FRIENDLY: Record<string, { label: string; desc: string; icon: string }> = {
  open:              { label: "Recebido",              desc: "Seu aparelho foi recebido e está na fila da bancada.", icon: "📥" },
  diagnosing:        { label: "Em diagnóstico",        desc: "O técnico está avaliando o aparelho.", icon: "🔍" },
  awaiting_approval: { label: "Aguardando sua aprovação", desc: "O orçamento está pronto — aprove ou recuse abaixo.", icon: "📋" },
  approved:          { label: "Aprovado",              desc: "Orçamento aprovado. O reparo vai começar.", icon: "👍" },
  awaiting_part:     { label: "Aguardando peça",       desc: "Estamos aguardando a chegada de uma peça.", icon: "📦" },
  repairing:         { label: "Em reparo",             desc: "Seu aparelho está sendo consertado.", icon: "🔧" },
  testing:           { label: "Em teste",              desc: "Reparo concluído — testando tudo antes de liberar.", icon: "🧪" },
  ready:             { label: "Pronto para retirada",  desc: "Pode vir buscar! Seu aparelho está pronto.", icon: "✅" },
  delivered:         { label: "Entregue",              desc: "Aparelho entregue. Obrigado pela confiança!", icon: "🎉" },
  canceled:          { label: "Cancelado",             desc: "Este atendimento foi cancelado.", icon: "✖" },
  unrepaired:        { label: "Sem reparo",            desc: "Não foi possível realizar o reparo. Fale com a loja.", icon: "ℹ️" },
};

export default async function PublicOsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  let os: Record<string, unknown> | null = null;
  if (uuidOk) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_os_get", { p_token: token });
    os = data as Record<string, unknown> | null;
  }

  if (!os) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-50 px-4 text-neutral-900">
        <div className="text-center">
          <p className="text-4xl">🔎</p>
          <h1 className="mt-2 text-xl font-bold">Ordem de serviço não encontrada</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Confira o link enviado pela loja ou entre em contato.
          </p>
        </div>
      </div>
    );
  }

  const status = String(os.status);
  const friendly = STATUS_FRIENDLY[status] ?? { label: status, desc: "", icon: "•" };
  const quote = os.quote as {
    status: string; total: number; valid_until: string | null;
    execution_days: number | null;
    items: { description: string; qty: number; unit_price: number; warranty_days: number }[];
  } | undefined;
  const timeline = (os.timeline as { to_status: string; at: string }[]) ?? [];
  const phone = String(os.store_phone ?? "").replace(/\D/g, "");

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 text-neutral-900">
      <div className="mx-auto grid max-w-lg gap-5">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
            {String(os.store_name)}
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Olá, {String(os.customer_name)}! 👋
          </h1>
          <p className="text-sm text-neutral-500">
            Acompanhamento da OS #{String(os.number)}
          </p>
        </header>

        <section className="rounded-2xl border bg-white p-5 text-center shadow-sm">
          <p className="text-4xl">{friendly.icon}</p>
          <h2 className="mt-2 text-xl font-bold">{friendly.label}</h2>
          <p className="mt-1 text-sm text-neutral-500">{friendly.desc}</p>
          {os.deadline && !["delivered", "canceled"].includes(status) ? (
            <p className="mt-3 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs">
              Previsão: {fmtDate(String(os.deadline))}
            </p>
          ) : null}
          {os.warranty_until && status === "delivered" ? (
            <p className="mt-3 inline-block rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
              Garantia até {fmtDate(String(os.warranty_until))}
            </p>
          ) : null}
        </section>

        {quote && status === "awaiting_approval" && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="font-bold">Orçamento</h3>
            <div className="mt-3 grid gap-2 text-sm">
              {quote.items.map((i, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {i.qty > 1 ? `${i.qty}× ` : ""}{i.description}
                    <span className="ml-1 text-xs text-neutral-400">
                      (garantia {i.warranty_days} dias)
                    </span>
                  </span>
                  <span>{brl(i.qty * i.unit_price)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>Total</span>
                <span>{brl(quote.total)}</span>
              </div>
              {quote.execution_days ? (
                <p className="text-xs text-neutral-500">
                  Prazo de execução: {quote.execution_days} dia(s) após aprovação
                </p>
              ) : null}
              {quote.valid_until ? (
                <p className="text-xs text-neutral-500">
                  Válido até {fmtDate(quote.valid_until)}
                </p>
              ) : null}
            </div>
            <div className="mt-4">
              <DecideButtons token={token} />
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="font-bold">Linha do tempo</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {[...timeline].reverse().map((t, i) => {
              const f = STATUS_FRIENDLY[t.to_status];
              return (
                <div key={i} className="flex items-center gap-2">
                  <span>{f?.icon ?? "•"}</span>
                  <span>{f?.label ?? t.to_status}</span>
                  <span className="ml-auto text-xs text-neutral-400">{fmtDateTime(t.at)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <span>📥</span>
              <span>Recebido</span>
              <span className="ml-auto text-xs text-neutral-400">
                {fmtDateTime(String(os.created_at))}
              </span>
            </div>
          </div>
        </section>

        {phone && (
          <a
            href={`https://wa.me/55${phone}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-green-600 px-4 py-3 text-center font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            💬 Falar com a loja no WhatsApp
          </a>
        )}

        <p className="text-center text-xs text-neutral-400">
          {String(os.store_name)} · atendimento registrado em {fmtDateTime(String(os.created_at))}
        </p>
      </div>
    </div>
  );
}

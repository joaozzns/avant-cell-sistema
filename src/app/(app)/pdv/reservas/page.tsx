import { getSessionContext } from "@/lib/context";
import { isoLocal } from "@/lib/format";
import { PainelReservas, type Reserva } from "./painel";

export default async function ReservasPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("reservations")
    .select(`
      id, customer_id, description, agreed_price, deposit_amount, deposit_policy, status,
      pickup_deadline, created_at, unit_id,
      customers(name, whatsapp, phone),
      products(name),
      serialized_units(imei1, color, capacity)
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(150);

  /* O crédito é um saldo só do cliente, e o PDV gasta o mais antigo primeiro:
     mostrar o valor do sinal como se ele estivesse guardado seria mentira se o
     cliente já usou crédito em outra compra. Então mostramos o saldo de hoje. */
  const { data: creditos } = await supabase
    .from("store_credits")
    .select("customer_id, balance, expires_at")
    .eq("company_id", companyId)
    .gt("balance", 0);

  const hoje = isoLocal();
  const saldoPorCliente = new Map<string, number>();
  for (const c of creditos ?? []) {
    if (c.expires_at && (c.expires_at as string) < hoje) continue;
    const id = c.customer_id as string;
    saldoPorCliente.set(id, (saldoPorCliente.get(id) ?? 0) + Number(c.balance));
  }

  const reservas: Reserva[] = (data ?? []).map((r) => {
    const c = r.customers as unknown as { name?: string; whatsapp?: string; phone?: string } | null;
    const u = r.serialized_units as unknown as { imei1?: string; color?: string; capacity?: string } | null;
    return {
      id: r.id as string,
      cliente: c?.name ?? "—",
      telefone: c?.whatsapp ?? c?.phone ?? null,
      produto: (r.products as unknown as { name?: string } | null)?.name ?? null,
      descricao: (r.description as string | null) ?? null,
      imei: u?.imei1 ?? null,
      detalheUnidade: [u?.color, u?.capacity].filter(Boolean).join(" · ") || null,
      precoCombinado: r.agreed_price === null ? null : Number(r.agreed_price),
      sinal: Number(r.deposit_amount ?? 0),
      politica: (r.deposit_policy as string | null) ?? null,
      situacao: r.status as string,
      prazo: (r.pickup_deadline as string | null) ?? null,
      criadaEm: r.created_at as string,
      creditoHoje: saldoPorCliente.get(r.customer_id as string) ?? 0,
    };
  });

  return <PainelReservas reservas={reservas} />;
}

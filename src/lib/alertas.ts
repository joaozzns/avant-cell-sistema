/** Tipos de alerta: o que é, para onde leva e como o dono deve ler. */
export const TIPO_ALERTA: Record<string, { rotulo: string; destino: string }> = {
  low_stock:            { rotulo: "Estoque no mínimo",       destino: "/estoque" },
  os_awaiting_48h:      { rotulo: "OS esperando aprovação",  destino: "/os" },
  not_picked_up:        { rotulo: "Aparelho não retirado",   destino: "/os" },
  fiscal_rejected:      { rotulo: "Nota rejeitada",          destino: "/fiscal" },
  unreconciled:         { rotulo: "Taxa de cartão diferente", destino: "/financeiro/conciliacao" },
  overdue_bill:         { rotulo: "Vencido",                 destino: "/financeiro/pagar" },
  inventory_divergence: { rotulo: "Inventário com diferença", destino: "/estoque/inventario" },
  certificate_expiring: { rotulo: "Certificado digital",     destino: "/fiscal/configuracoes" },
};

export const GRAVIDADE: Record<string, { rotulo: string; ordem: number }> = {
  critical: { rotulo: "urgente", ordem: 0 },
  warning:  { rotulo: "atenção", ordem: 1 },
  info:     { rotulo: "aviso",   ordem: 2 },
};

/** Alerta de OS ou de conta leva direto ao registro; os demais, à lista. */
export function destinoDoAlerta(kind: string, refTable: string | null, refId: string | null) {
  if (refTable === "service_orders" && refId) return `/os/${refId}`;
  if (refTable === "receivables") return "/financeiro/receber";
  if (refTable === "inventories" && refId) return `/estoque/inventario/${refId}`;
  return TIPO_ALERTA[kind]?.destino ?? "/dashboard";
}

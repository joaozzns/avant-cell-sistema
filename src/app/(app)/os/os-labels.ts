export const OS_STATUS: Record<string, { label: string; color: string }> = {
  open:              { label: "Aberta",               color: "bg-slate-500" },
  diagnosing:        { label: "Em diagnóstico",       color: "bg-blue-500" },
  awaiting_approval: { label: "Aguard. aprovação",    color: "bg-amber-500" },
  approved:          { label: "Aprovada",             color: "bg-violet-500" },
  awaiting_part:     { label: "Aguardando peça",      color: "bg-orange-500" },
  repairing:         { label: "Em reparo",            color: "bg-cyan-600" },
  testing:           { label: "Em teste",             color: "bg-teal-500" },
  ready:             { label: "Pronta",               color: "bg-green-600" },
  delivered:         { label: "Entregue",             color: "bg-gray-400" },
  canceled:          { label: "Cancelada",            color: "bg-red-500" },
  unrepaired:        { label: "Sem reparo",           color: "bg-red-400" },
};

export const KANBAN_COLUMNS = [
  "open", "diagnosing", "awaiting_approval", "approved",
  "awaiting_part", "repairing", "testing", "ready",
];

"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  setOsStatus, assignTechnician, saveDiagnostic, addQuoteItem, removeQuoteItem,
  sendQuote, decideQuoteInPerson, searchParts, requestPart, applyPart,
  returnPart, addComment, toggleTimer, deliverOs, cancelOs, type ActionState,
} from "../actions";
import { OS_STATUS } from "../os-labels";
import { brl, fmtDateTime, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FotosOs } from "./fotos";
import { AvisosOs, type AvisoOs } from "./avisos";
import { ServicoExterno } from "./externo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NEXT_ACTIONS: Record<string, { to: string; label: string; variant?: "default" | "secondary" | "destructive" }[]> = {
  open: [{ to: "diagnosing", label: "Iniciar diagnóstico" }],
  diagnosing: [{ to: "unrepaired", label: "Sem reparo", variant: "destructive" }],
  approved: [
    { to: "repairing", label: "Iniciar reparo" },
    { to: "awaiting_part", label: "Aguardando peça", variant: "secondary" },
  ],
  awaiting_part: [{ to: "repairing", label: "Iniciar reparo" }],
  repairing: [
    { to: "testing", label: "Enviar para teste" },
    { to: "awaiting_part", label: "Aguardando peça", variant: "secondary" },
  ],
  testing: [
    { to: "ready", label: "Marcar como pronta" },
    { to: "repairing", label: "Voltar ao reparo", variant: "secondary" },
  ],
};

const PAYMENT_KINDS = [
  { kind: "cash", label: "Dinheiro" },
  { kind: "pix", label: "Pix" },
  { kind: "debit", label: "Débito" },
  { kind: "credit", label: "Crédito" },
  { kind: "credit_installments", label: "Parcelado" },
];

const CHECKLIST_LABELS: Record<string, string> = {
  liga: "Liga", tela_ok: "Tela sem trinca", touch: "Touch", cameras: "Câmeras",
  botoes: "Botões", alto_falante: "Alto-falante", microfone: "Microfone",
  biometria: "Biometria", carga: "Carrega", sinal: "Sinal/chip",
  sem_oxidacao: "Sem oxidação", sem_abertura: "Sem abertura anterior",
};

export function OsDetailClient({
  os, diagnostics, quotes, parts, comments, history, laborLogs, technicians, currentUserId, companyId,
  avisos, modelosAviso, temFoto, origem,
}: {
  os: any; diagnostics: any[]; quotes: any[]; parts: any[]; comments: any[];
  history: any[]; laborLogs: any[]; technicians: any[]; currentUserId: string; companyId: string;
  avisos: AvisoOs[]; modelosAviso: { key: string; name: string }[]; temFoto: boolean;
  origem: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showDeliver, setShowDeliver] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const meta = OS_STATUS[os.status] ?? { label: os.status, color: "bg-gray-400" };
  const customer = os.customers ?? {};
  const device = os.customer_devices ?? {};
  const publicUrl = `${origem}/acompanhar/${os.public_token}`;

  const draftQuote = quotes.find((q: any) => q.status === "draft");
  const sentQuote = quotes.find((q: any) => q.status === "sent");
  const approvedQuote = quotes.find((q: any) => ["approved", "partially_approved"].includes(q.status));
  const activeQuote = sentQuote ?? approvedQuote ?? draftQuote;

  const runningLog = laborLogs.find((l: any) => !l.ended_at && l.technician_id === currentUserId);
  const totalMinutes = laborLogs.reduce((s: number, l: any) => s + (l.minutes ?? 0), 0);

  function act(fn: () => Promise<ActionState | { error?: string }>) {
    setError("");
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  const phone = (customer.whatsapp ?? customer.phone ?? "").replace(/\D/g, "");
  const waLink = phone
    ? `https://wa.me/55${phone}?text=${encodeURIComponent(
        `Olá ${customer.name?.split(" ")[0]}! Acompanhe sua OS #${os.number} em: ${publicUrl}`)}`
    : null;

  return (
    <div className="grid gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">OS #{os.number}</h1>
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white ${meta.color}`}>
              {meta.label}
            </span>
            {os.priority === "urgent" && <Badge variant="destructive">urgente</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {customer.name} · {device.model_text}
            {device.imei && <span className="ml-1 font-mono text-xs">IMEI {device.imei}</span>}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>aberta {fmtDateTime(os.created_at)}</span>
            {os.deadline && <span>prazo {fmtDate(os.deadline)}</span>}
            {os.warranty_until && <span className="text-green-600">garantia até {fmtDate(os.warranty_until)}</span>}
            {totalMinutes > 0 && <span>{totalMinutes} min trabalhados</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/imprimir/os/${os.id}`} target="_blank" rel="noreferrer"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            🖨️ Imprimir OS
          </a>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              WhatsApp 💬
            </a>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(publicUrl)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            title={publicUrl}
          >
            Copiar link público
          </button>
          {!["delivered", "canceled"].includes(os.status) && (
            <Button variant={runningLog ? "destructive" : "secondary"} size="sm"
              onClick={() => act(() => toggleTimer(os.id))}>
              {runningLog ? "⏸ Parar cronômetro" : "▶ Iniciar trabalho"}
            </Button>
          )}
        </div>
      </div>

      {/* Ações de status */}
      <div className="flex flex-wrap items-center gap-2">
        {(NEXT_ACTIONS[os.status] ?? []).map((a) => (
          <Button key={a.to} variant={a.variant ?? "default"} disabled={pending}
            onClick={() => act(() => setOsStatus(os.id, a.to))}>
            {a.label}
          </Button>
        ))}
        {["ready", "unrepaired"].includes(os.status) && (
          <Button onClick={() => setShowDeliver(true)}>Entregar aparelho</Button>
        )}
        {!["delivered", "canceled"].includes(os.status) && (
          <Button variant="ghost" className="text-destructive" onClick={() => setShowCancel(true)}>
            Cancelar OS
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Técnico:</span>
          <select
            value={os.technician_id ?? ""}
            onChange={(e) => act(async () => { await assignTechnician(os.id, e.target.value || null); return {}; })}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {technicians.map((t: any) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Coluna 1 */}
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Check-in</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p><span className="text-muted-foreground">Defeito relatado:</span> {os.reported_issue}</p>
              {os.symptom_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {os.symptom_tags.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(os.entry_checklist ?? {}).map(([k, v]) => (
                  <span key={k} className={`rounded px-2 py-0.5 text-xs ${v ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                    {v ? "✓" : "✗"} {CHECKLIST_LABELS[k] ?? k}
                  </span>
                ))}
              </div>
              {os.accessories?.length > 0 && (
                <p><span className="text-muted-foreground">Acessórios:</span> {os.accessories.join(", ")}</p>
              )}
              {os.internal_state_unknown && (
                <p className="text-amber-600">⚠ Aparelho não liga: estado interno não verificável</p>
              )}
              {Number(os.diagnosis_fee) > 0 && (
                <p><span className="text-muted-foreground">Taxa de diagnóstico:</span> {brl(os.diagnosis_fee)}</p>
              )}
            </CardContent>
          </Card>

          <FotosOs osId={os.id} companyId={companyId} />

          <ServicoExterno osId={os.id} temFoto={temFoto} />

          <DiagnosticSection os={os} diagnostics={diagnostics} />

          <Card>
            <CardHeader><CardTitle className="text-base">Comentários internos</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <CommentForm osId={os.id} />
              <div className="grid gap-2 text-sm">
                {comments.map((c: any) => (
                  <div key={c.id} className="rounded border px-3 py-2">
                    <p>{c.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.profiles?.full_name} · {fmtDateTime(c.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna 2 */}
        <div className="grid content-start gap-6">
          <QuoteSection
            os={os} draftQuote={draftQuote} sentQuote={sentQuote}
            approvedQuote={approvedQuote} activeQuote={activeQuote}
            quotes={quotes} act={act} pending={pending}
          />
          <PartsSection os={os} parts={parts} act={act} pending={pending} />

          <AvisosOs
            osId={os.id}
            avisos={avisos}
            modelos={modelosAviso}
            telefone={customer.whatsapp ?? customer.phone ?? null}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${OS_STATUS[h.to_status]?.color ?? "bg-gray-400"}`} />
                  <span>{OS_STATUS[h.to_status]?.label ?? h.to_status}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(h.created_at)}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                <span>Aberta</span>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(os.created_at)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entrega */}
      <DeliverDialog
        open={showDeliver} onClose={() => setShowDeliver(false)}
        os={os} approvedQuote={approvedQuote} router={router}
      />

      {/* Cancelamento */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar OS #{os.number}</DialogTitle></DialogHeader>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Motivo do cancelamento (obrigatório)" />
          <Button variant="destructive" disabled={pending || !cancelReason.trim()}
            onClick={() => act(() => cancelOs(os.id, cancelReason))}>
            Confirmar cancelamento
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Diagnóstico ---------- */
function DiagnosticSection({ os, diagnostics }: { os: any; diagnostics: any[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDiagnostic, {});
  const canDiagnose = ["open", "diagnosing"].includes(os.status);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Diagnóstico e laudo</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {diagnostics.map((d: any) => (
          <div key={d.id} className="grid gap-1 rounded border px-3 py-2 text-sm">
            <p><span className="text-muted-foreground">Constatado:</span> {d.found_issue}</p>
            {d.probable_cause && <p><span className="text-muted-foreground">Causa provável:</span> {d.probable_cause}</p>}
            {d.procedure && <p><span className="text-muted-foreground">Procedimento:</span> {d.procedure}</p>}
            <div className="flex flex-wrap gap-2">
              <Badge variant={d.classification === "repairable" ? "default" : "destructive"}>
                {d.classification === "repairable" ? "Com reparo"
                  : d.classification === "unrepairable" ? "Sem reparo" : "Reparo inviável"}
              </Badge>
              {d.oxidation && <Badge variant="destructive">oxidação</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {d.profiles?.full_name} · {fmtDateTime(d.created_at)}
            </p>
          </div>
        ))}

        {canDiagnose && (
          <form action={formAction} className="grid gap-2">
            <input type="hidden" name="os_id" value={os.id} />
            <textarea name="found_issue" required rows={2}
              placeholder="Defeito constatado *"
              className="rounded-md border bg-transparent px-3 py-2 text-sm" />
            <Input name="probable_cause" placeholder="Causa provável" />
            <Input name="procedure" placeholder="Procedimento indicado" />
            <div className="flex flex-wrap items-center gap-3">
              <select name="classification" className="h-9 rounded-md border bg-transparent px-2 text-sm">
                <option value="repairable">Com reparo</option>
                <option value="unrepairable">Sem reparo</option>
                <option value="uneconomic">Reparo inviável economicamente</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="oxidation" /> Oxidação detectada
              </label>
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? "Salvando…" : "Registrar laudo"}
              </Button>
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Orçamento ---------- */
function QuoteSection({
  os, draftQuote, sentQuote, approvedQuote, quotes, act, pending,
}: any) {
  const [state, formAction, formPending] = useActionState<ActionState, FormData>(addQuoteItem, {});
  const [rejectReason, setRejectReason] = useState("");
  const canBuild = ["diagnosing", "awaiting_approval"].includes(os.status);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Orçamento</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {quotes.filter((q: any) => q.status !== "draft").map((q: any) => (
          <div key={q.id} className="grid gap-1 rounded border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">Versão {q.version} · {brl(q.total)}</span>
              <Badge variant={
                q.status === "approved" ? "default"
                : q.status === "sent" ? "secondary"
                : q.status === "rejected" ? "destructive" : "outline"}>
                {q.status === "approved" ? "aprovado" : q.status === "sent" ? "enviado"
                  : q.status === "rejected" ? "recusado" : q.status === "superseded" ? "superado" : q.status}
              </Badge>
            </div>
            {(q.os_quote_items ?? []).map((i: any) => (
              <div key={i.id} className="flex justify-between text-muted-foreground">
                <span>{i.qty}× {i.description}</span>
                <span>{brl(Number(i.qty) * Number(i.unit_price))}</span>
              </div>
            ))}
            {q.decided_at && (
              <p className="text-xs text-muted-foreground">
                {q.status === "approved" ? "Aprovado" : "Recusado"} em {fmtDateTime(q.decided_at)}
                {q.approval_channel === "link" ? " pelo link público" : " presencialmente"}
                {q.approval_ip ? ` · IP ${q.approval_ip}` : ""}
                {q.rejection_reason ? ` · motivo: ${q.rejection_reason}` : ""}
              </p>
            )}
          </div>
        ))}

        {sentQuote && os.status === "awaiting_approval" && (
          <div className="grid gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">Aguardando aprovação do cliente</p>
            <p className="text-muted-foreground">
              O cliente pode aprovar pelo link público, ou registre a decisão presencial:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending}
                onClick={() => act(() => decideQuoteInPerson(sentQuote.id, os.id, true))}>
                Aprovar (presencial)
              </Button>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo da recusa" className="h-8 w-44" />
              <Button size="sm" variant="destructive" disabled={pending}
                onClick={() => act(() => decideQuoteInPerson(sentQuote.id, os.id, false, rejectReason))}>
                Recusar
              </Button>
            </div>
          </div>
        )}

        {canBuild && (
          <div className="grid gap-2">
            {draftQuote && (draftQuote.os_quote_items ?? []).length > 0 && (
              <div className="grid gap-1 rounded border px-3 py-2 text-sm">
                <p className="font-medium">Rascunho v{draftQuote.version} · {brl(draftQuote.total)}</p>
                {(draftQuote.os_quote_items ?? []).map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between text-muted-foreground">
                    <span>{i.qty}× {i.description}</span>
                    <span className="flex items-center gap-2">
                      {brl(Number(i.qty) * Number(i.unit_price))}
                      <button onClick={() => act(async () => { await removeQuoteItem(i.id, draftQuote.id, os.id); return {}; })}
                        className="hover:text-destructive">✕</button>
                    </span>
                  </div>
                ))}
                <Button size="sm" className="mt-1 w-fit" disabled={pending}
                  onClick={() => act(() => sendQuote(draftQuote.id, os.id))}>
                  Enviar para aprovação
                </Button>
              </div>
            )}
            <form action={formAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="os_id" value={os.id} />
              <div className="grid min-w-44 flex-1 gap-1">
                <label className="text-xs text-muted-foreground">Item</label>
                <Input name="description" placeholder="ex.: Troca de tela (original)" required />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select name="kind" className="h-9 rounded-md border bg-transparent px-2 text-sm">
                  <option value="part">Peça</option>
                  <option value="labor">Mão de obra</option>
                  <option value="service">Serviço</option>
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Qtd.</label>
                <Input name="qty" defaultValue="1" className="w-16" />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Preço (R$)</label>
                <Input name="unit_price" inputMode="decimal" className="w-24" required />
              </div>
              <Button type="submit" variant="secondary" disabled={formPending}>Adicionar</Button>
            </form>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Peças ---------- */
function PartsSection({ os, parts, act, pending }: any) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; price: number; available: number }[]>([]);
  const [, startTransition] = useTransition();
  const active = !["delivered", "canceled"].includes(os.status);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => {
      startTransition(async () => setResults(await searchParts(term)));
    }, 250);
    return () => clearTimeout(h);
  }, [term]);

  const PART_STATUS: Record<string, string> = {
    requested: "requisitada", reserved: "reservada", applied: "aplicada",
    returned: "devolvida", defective: "defeituosa", purchase_needed: "comprar",
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Peças da OS</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        {active && (
          <div className="relative">
            <Input value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder="Requisitar peça do estoque…" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
                {results.map((r) => (
                  <button key={r.id}
                    onClick={() => {
                      act(() => requestPart(os.id, r.id, 1, r.price));
                      setTerm(""); setResults([]);
                    }}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{r.name}
                      <span className={`ml-2 text-xs ${r.available <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.available <= 0 ? "sem estoque livre" : `${r.available} disp.`}
                      </span>
                    </span>
                    <span>{brl(r.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-1.5 text-sm">
          {parts.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded border px-3 py-1.5">
              <span>
                {p.qty}× {p.products?.name}
                <Badge variant={p.status === "applied" ? "default" : "secondary"} className="ml-2">
                  {PART_STATUS[p.status] ?? p.status}
                </Badge>
              </span>
              <span className="flex items-center gap-2">
                {brl(Number(p.qty) * Number(p.unit_price))}
                {["requested", "reserved"].includes(p.status) && active && (
                  <>
                    <Button size="sm" variant="secondary" disabled={pending}
                      onClick={() => act(() => applyPart(p.id, os.id))}>
                      Aplicar
                    </Button>
                    <button onClick={() => act(() => returnPart(p.id, os.id))}
                      className="text-xs text-muted-foreground hover:text-destructive">
                      devolver
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
          {parts.length === 0 && <p className="text-muted-foreground">Nenhuma peça requisitada.</p>}
        </div>
        {Number(os.cost_parts) > 0 && (
          <p className="text-xs text-muted-foreground">
            Custo de peças aplicado nesta OS: {brl(os.cost_parts)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Comentário ---------- */
function CommentForm({ osId }: { osId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addComment, {});
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="os_id" value={osId} />
      <Input name="message" placeholder="Comentário interno (não aparece no link público)…" />
      <Button type="submit" variant="secondary" disabled={pending}>Enviar</Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}

/* ---------- Entrega ---------- */
function DeliverDialog({ open, onClose, os, approvedQuote, router }: any) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [deliveredTo, setDeliveredTo] = useState("");
  const [payments, setPayments] = useState<{ kind: string; amount: number; installments?: number; changeGiven?: number }[]>([]);
  const [payKind, setPayKind] = useState("cash");
  const [payAmount, setPayAmount] = useState("");
  const [doneNumber, setDoneNumber] = useState<number | null>(null);

  const total = os.status === "ready"
    ? Number(approvedQuote?.total ?? 0)
    : Number(os.diagnosis_fee ?? 0);
  const paid = payments.reduce((s, p) => s + p.amount - (p.changeGiven ?? 0), 0);
  const remaining = Math.round((total - paid) * 100) / 100;

  function addPayment() {
    const amount = Number(payAmount.replace(/\./g, "").replace(",", "."));
    if (!amount || amount <= 0) return;
    const change = payKind === "cash" && amount > remaining ? amount - remaining : 0;
    setPayments((prev) => [...prev, { kind: payKind, amount, changeGiven: change }]);
    const nr = Math.max(remaining - (amount - change), 0);
    setPayAmount(nr > 0 ? nr.toFixed(2).replace(".", ",") : "");
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await deliverOs({ osId: os.id, deliveredTo, payments });
      if (r.error) { setError(r.error); return; }
      setDoneNumber(r.saleNumber ?? 0);
      router.refresh();
    });
  }

  useEffect(() => {
    if (open) {
      setPayments([]); setError(""); setDoneNumber(null);
      setPayAmount(total > 0 ? total.toFixed(2).replace(".", ",") : "");
    }
  }, [open, total]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {doneNumber !== null ? "Aparelho entregue ✓" : `Entrega — total ${brl(total)}`}
          </DialogTitle>
        </DialogHeader>

        {doneNumber !== null ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {doneNumber > 0
                ? `Venda #${doneNumber} gerada e caixa atualizado. `
                : ""}
              Garantia de {os.warranty_days} dias contada a partir de agora.
            </p>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <Input value={deliveredTo} onChange={(e) => setDeliveredTo(e.target.value)}
              placeholder="Quem retirou (titular ou terceiro autorizado)" />

            {total > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_KINDS.map((k) => (
                    <button key={k.kind} onClick={() => setPayKind(k.kind)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${payKind === k.kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input inputMode="decimal" value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)} placeholder="Valor"
                    onKeyDown={(e) => e.key === "Enter" && addPayment()} />
                  <Button variant="secondary" onClick={addPayment}>Adicionar</Button>
                </div>
                {payments.map((p, i) => (
                  <div key={i} className="flex justify-between rounded border px-3 py-1.5 text-sm">
                    <span>{PAYMENT_KINDS.find((k) => k.kind === p.kind)?.label}
                      {(p.changeGiven ?? 0) > 0 && <span className="ml-2 text-muted-foreground">troco {brl(p.changeGiven!)}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {brl(p.amount)}
                      <button onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive">✕</button>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 text-sm font-medium">
                  <span>{remaining > 0 ? "Falta" : "Pago"}</span>
                  <span className={remaining > 0 ? "text-destructive" : "text-green-600"}>
                    {remaining > 0 ? brl(remaining) : "✓"}
                  </span>
                </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button size="lg" disabled={pending || (total > 0 && remaining !== 0)} onClick={submit}>
              {pending ? "Entregando…" : "Confirmar entrega"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

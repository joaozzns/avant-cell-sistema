"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOs } from "../actions";
import { searchCustomers } from "@/app/(app)/pdv/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Customer = { id: string; name: string; cpf_cnpj: string | null; phone: string | null };

const CHECKLIST_ITEMS = [
  ["liga", "Liga"],
  ["tela_ok", "Tela sem trinca"],
  ["touch", "Touch funciona"],
  ["cameras", "Câmeras OK"],
  ["botoes", "Botões OK"],
  ["alto_falante", "Alto-falante OK"],
  ["microfone", "Microfone OK"],
  ["biometria", "Biometria OK"],
  ["carga", "Carrega"],
  ["sinal", "Sinal / chip OK"],
  ["sem_oxidacao", "Sem sinais de líquido/oxidação"],
  ["sem_abertura", "Sem marca de abertura anterior"],
] as const;

const SYMPTOM_TAGS = [
  "Tela quebrada", "Não liga", "Bateria", "Não carrega", "Molhou",
  "Câmera", "Áudio", "Software", "Conector", "Lentidão",
];

const ACCESSORIES = ["Capa", "Película", "Chip", "Cartão SD", "Carregador", "Caixa"];

export function OsForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [custTerm, setCustTerm] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [color, setColor] = useState("");
  const [capacity, setCapacity] = useState("");

  const [issue, setIssue] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST_ITEMS.map(([k]) => [k, true]))
  );
  const [accessories, setAccessories] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [noPassword, setNoPassword] = useState(false);
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [deadline, setDeadline] = useState("");
  const [estimated, setEstimated] = useState("");
  const [diagFee, setDiagFee] = useState("");

  useEffect(() => {
    if (custTerm.trim().length < 2) { setCustResults([]); return; }
    const h = setTimeout(() => {
      startTransition(async () => setCustResults(await searchCustomers(custTerm)));
    }, 250);
    return () => clearTimeout(h);
  }, [custTerm]);

  function toggle(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  function submit() {
    setError("");
    if (!customer && !newName.trim()) { setError("Vincule ou cadastre o cliente."); return; }
    if (!brand.trim() || !model.trim()) { setError("Informe marca e modelo do aparelho."); return; }
    if (!issue.trim()) { setError("Descreva o defeito relatado pelo cliente."); return; }

    startTransition(async () => {
      const res = await createOs({
        customerId: customer?.id ?? null,
        newCustomer: customer ? null : { name: newName.trim(), phone: newPhone.trim() },
        device: { brand, model, imei, color, capacity },
        reportedIssue: issue,
        symptomTags: tags,
        checklist,
        accessories,
        devicePassword: noPassword ? undefined : password,
        passwordNotGiven: noPassword,
        priority,
        deadline: deadline || null,
        estimatedPrice: estimated ? Number(estimated.replace(",", ".")) : null,
        diagnosisFee: diagFee ? Number(diagFee.replace(",", ".")) : null,
      });
      if (res.error) { setError(res.error); return; }
      router.push(`/os/${res.osId}`);
    });
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">1 · Cliente</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {customer ? (
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <span className="font-medium">{customer.name}
                <span className="ml-2 text-sm text-muted-foreground">{customer.phone ?? customer.cpf_cnpj ?? ""}</span>
              </span>
              <button onClick={() => setCustomer(null)} className="text-sm text-muted-foreground hover:text-destructive">
                trocar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Input value={custTerm} onChange={(e) => setCustTerm(e.target.value)}
                  placeholder="Buscar cliente existente (nome, CPF, telefone)…" />
                {custResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => { setCustomer(c); setCustTerm(""); }}
                        className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                        <span>{c.name}</span>
                        <span className="text-muted-foreground">{c.phone ?? c.cpf_cnpj ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">…ou cadastre na hora:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do cliente" />
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="WhatsApp / telefone" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Aparelho</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Marca *" />
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo *" />
          <Input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI / nº de série" inputMode="numeric" />
          <div className="grid grid-cols-2 gap-3">
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Cor" />
            <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacidade" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3 · Defeito relatado</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <textarea
            value={issue} onChange={(e) => setIssue(e.target.value)}
            placeholder="O que o cliente relatou? *" rows={3}
            className="rounded-md border bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_TAGS.map((t) => (
              <button key={t} type="button" onClick={() => toggle(tags, setTags, t)}
                className={`rounded-full border px-3 py-1 text-xs ${tags.includes(t) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4 · Estado de entrada (checklist)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST_ITEMS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={checklist[key]}
                onChange={(e) => setChecklist((c) => ({ ...c, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Desmarque o que NÃO está OK. Aparelho que não liga é registrado como
            “estado interno não verificável”.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5 · Acessórios e acesso</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {ACCESSORIES.map((a) => (
              <button key={a} type="button" onClick={() => toggle(accessories, setAccessories, a)}
                className={`rounded-full border px-3 py-1 text-xs ${accessories.includes(a) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {a}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha / padrão de desbloqueio" disabled={noPassword} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={noPassword} onChange={(e) => setNoPassword(e.target.checked)} />
              Cliente não informou a senha
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6 · Prioridade e valores</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1">
            <Label>Prioridade</Label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="normal">Normal</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>Prazo estimado</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Valor prévio (R$)</Label>
            <Input inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Taxa de diagnóstico (R$)</Label>
            <Input inputMode="decimal" value={diagFee} onChange={(e) => setDiagFee(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" onClick={submit} disabled={pending}>
        {pending ? "Abrindo OS…" : "Abrir OS e gerar link de acompanhamento"}
      </Button>
    </div>
  );
}

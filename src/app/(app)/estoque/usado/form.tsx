"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { caminhoArquivo, comprimirImagem, extensaoDe } from "@/lib/fotos";
import { imeiValido } from "@/lib/imei";
import { SITUACOES, URL_CONSULTA_OFICIAL, type ResultadoImei } from "@/lib/imei-consulta";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buscarClientes, buscarModelos, consultarBloqueio, registrarUsado } from "./actions";

const CHECKLIST = [
  ["tela", "Tela sem trinca"],
  ["touch", "Touch funciona"],
  ["bateria", "Bateria boa"],
  ["cameras", "Câmeras OK"],
  ["botoes", "Botões OK"],
  ["biometria", "Biometria OK"],
  ["carga", "Carrega"],
  ["sem_oxidacao", "Sem oxidação"],
  ["icloud_limpo", "Conta removida (iCloud/Google)"],
] as const;

const ACESSORIOS = ["Caixa", "Carregador", "Cabo", "Fone", "Capinha", "Nota fiscal"];
const CONDICOES = [
  { valor: "seminew", rotulo: "Seminovo" },
  { valor: "used", rotulo: "Usado" },
  { valor: "showcase", rotulo: "Vitrine" },
];
const PAGAMENTOS = [
  { valor: "cash", rotulo: "Dinheiro", ajuda: "Sai do seu caixa aberto." },
  { valor: "pix", rotulo: "Pix", ajuda: "Só registra; a transferência é feita fora do sistema." },
  { valor: "store_credit", rotulo: "Crédito na loja", ajuda: "Vira saldo do cliente para abater a compra do aparelho novo." },
];

type Modelo = { id: string; nome: string; marca: string | null; preco: number };
type Cliente = { id: string; name: string; cpf_cnpj: string | null };

export function FormUsado({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [pasta] = useState(() => crypto.randomUUID());
  const [erro, setErro] = useState("");

  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [buscaModelo, setBuscaModelo] = useState("");
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [imei, setImei] = useState("");
  const [cor, setCor] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [condicao, setCondicao] = useState("seminew");
  const [consulta, setConsulta] = useState<ResultadoImei | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST.map(([k]) => [k, true])),
  );
  const [acessorios, setAcessorios] = useState<string[]>([]);

  const [vendedorNome, setVendedorNome] = useState("");
  const [vendedorCpf, setVendedorCpf] = useState("");
  const [vendedorRg, setVendedorRg] = useState("");
  const [docFoto, setDocFoto] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [valor, setValor] = useState("");
  const [sugerido, setSugerido] = useState("");
  const [pagamento, setPagamento] = useState("cash");

  const valorPago = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const precoSugerido = Number(sugerido.replace(/\./g, "").replace(",", ".")) || 0;
  const imeiOk = imei.length === 0 || imeiValido(imei);
  const margem = precoSugerido > 0 && valorPago > 0 ? precoSugerido - valorPago : 0;

  async function enviarArquivo(arquivo: File, destino: "doc" | "aparelho") {
    setErro("");
    setEnviando(true);
    try {
      const supabase = createClient();
      const comprimido = await comprimirImagem(arquivo);
      const caminho = caminhoArquivo(companyId, "trade-in", pasta, extensaoDe(comprimido));
      const { error } = await supabase.storage
        .from("documents")
        .upload(caminho, comprimido, { contentType: comprimido.type || "image/jpeg" });
      if (error) throw new Error(error.message);
      if (destino === "doc") setDocFoto(caminho);
      else setFotos((f) => [...f, caminho]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  function salvar() {
    setErro("");
    if (!modelo) return setErro("Escolha o modelo do aparelho (é ele que entra no estoque).");
    if (!imeiValido(imei)) return setErro("IMEI inválido. Confira os 15 dígitos.");
    if (!vendedorNome.trim() || !vendedorCpf.trim()) return setErro("Informe nome e CPF de quem está vendendo.");
    if (!docFoto) return setErro("Falta a foto do documento do vendedor.");
    if (!consulta) return setErro("Confira o IMEI na base de bloqueio antes de comprar.");
    if (consulta.situacao === "bloqueado") return setErro("IMEI bloqueado: a compra não pode ser registrada.");
    if (valorPago <= 0) return setErro("Informe o valor pago.");
    if (pagamento === "store_credit" && !cliente) return setErro("Crédito na loja exige um cliente cadastrado.");

    iniciar(async () => {
      const r = await registrarUsado({
        produtoId: modelo.id, marca: modelo.marca ?? "", modelo: modelo.nome,
        imei, cor, capacidade, condicao, checklist, acessorios,
        vendedorNome, vendedorCpf, vendedorRg, docFoto, fotos,
        clienteId: cliente?.id ?? null, consultaImei: consulta,
        valorPago, precoSugerido: precoSugerido || null, formaPagamento: pagamento,
      });
      if (r.error) { setErro(r.error); return; }
      router.push("/estoque/aparelhos?usado=ok");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">1 · Quem está vendendo</CardTitle>
          <p className="text-xs text-muted-foreground">
            A foto do documento é obrigatória: é ela que protege a loja se o aparelho tiver sido furtado.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Nome completo</Label>
            <Input value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>CPF</Label>
            <Input value={vendedorCpf} onChange={(e) => setVendedorCpf(e.target.value)} inputMode="numeric" />
          </div>
          <div className="grid gap-1.5">
            <Label>RG (opcional)</Label>
            <Input value={vendedorRg} onChange={(e) => setVendedorRg(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Foto do documento</Label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm ${docFoto ? "border-green-600 text-green-700 dark:text-green-400" : "hover:bg-muted"}`}>
              {docFoto ? <><Check className="h-4 w-4" /> Documento anexado</> : <><Camera className="h-4 w-4" /> Fotografar documento</>}
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0], "doc")} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">2 · Aparelho que está entrando</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-1.5">
            <Label>Modelo no catálogo</Label>
            {modelo ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>{modelo.nome}{modelo.marca && ` · ${modelo.marca}`}</span>
                <button onClick={() => setModelo(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar modelo (ex.: iPhone 13 128GB)"
                  value={buscaModelo}
                  onChange={async (e) => {
                    setBuscaModelo(e.target.value);
                    setModelos(await buscarModelos(e.target.value));
                  }} />
                {modelos.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
                    {modelos.map((m) => (
                      <button key={m.id} onClick={() => { setModelo(m); setModelos([]); setBuscaModelo(""); if (!sugerido && m.preco) setSugerido(m.preco.toFixed(2).replace(".", ",")); }}
                        className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                        <span>{m.nome}</span>
                        <span className="text-muted-foreground">{brl(m.preco)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>IMEI</Label>
              <Input value={imei} onChange={(e) => { setImei(e.target.value.replace(/\D/g, "").slice(0, 15)); setConsulta(null); }}
                inputMode="numeric" placeholder="15 dígitos"
                className={!imeiOk ? "border-destructive" : ""} />
              {!imeiOk && <span className="text-xs text-destructive">IMEI não confere</span>}
            </div>
            <div className="grid gap-1.5">
              <Label>Cor</Label>
              <Input value={cor} onChange={(e) => setCor(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Capacidade</Label>
              <Input value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="128GB" />
            </div>
          </div>

          {/* consulta de bloqueio */}
          <div className={`rounded-lg border p-3 ${consulta?.situacao === "bloqueado" ? "border-destructive bg-destructive/5" : consulta?.situacao === "livre" ? "border-green-600/40 bg-green-50 dark:bg-green-950/20" : "border-dashed"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {consulta?.situacao === "bloqueado" ? (
                  <span className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-4 w-4" /> IMEI bloqueado — não compre</span>
                ) : consulta?.situacao === "livre" ? (
                  <span className="flex items-center gap-2 text-green-700 dark:text-green-400"><ShieldCheck className="h-4 w-4" /> IMEI livre</span>
                ) : consulta?.situacao === "nao_encontrado" ? (
                  <span className="flex items-center gap-2">IMEI não encontrado na base</span>
                ) : (
                  <span>Consulta de roubo/furto — obrigatória</span>
                )}
              </span>
              <Button type="button" variant="outline" size="sm" disabled={!imeiValido(imei) || consultando}
                onClick={async () => {
                  setErro(""); setConsultando(true);
                  const r = await consultarBloqueio(imei);
                  setConsultando(false);
                  if (r) { setConsulta(r); return; }
                  window.open(`${URL_CONSULTA_OFICIAL}`, "_blank", "noopener");
                  setConsulta(null);
                  setErro("Sem serviço de consulta contratado: confira na página que abriu e registre abaixo o que apareceu.");
                }}>
                {consultando ? "Consultando…" : "Consultar IMEI"}
              </Button>
            </div>

            {consulta?.fonte === "consulta_automatica" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Consulta automática{consulta.detalhe ? ` · ${consulta.detalhe}` : ""}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {SITUACOES.map((s) => (
                <button key={s.valor} type="button" title={s.ajuda}
                  onClick={() => setConsulta({
                    situacao: s.valor, fonte: "conferencia_manual", consultado_em: new Date().toISOString(),
                  })}
                  className={`rounded-md border px-3 py-1.5 text-xs ${consulta?.situacao === s.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {s.rotulo}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem serviço contratado, confira na página oficial da Anatel e marque aqui o que apareceu.
              Fica registrado quem conferiu e quando.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {CONDICOES.map((c) => (
              <button key={c.valor} type="button" onClick={() => setCondicao(c.valor)}
                className={`rounded-md border px-3 py-1.5 text-sm ${condicao === c.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {c.rotulo}
              </button>
            ))}
          </div>

          <div>
            <Label className="mb-2 block">Estado do aparelho</Label>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {CHECKLIST.map(([chave, rotulo]) => (
                <label key={chave} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={checklist[chave]}
                    onChange={() => setChecklist((c) => ({ ...c, [chave]: !c[chave] }))} />
                  {rotulo}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Acessórios que vieram junto</Label>
            <div className="flex flex-wrap gap-2">
              {ACESSORIOS.map((a) => (
                <button key={a} type="button"
                  onClick={() => setAcessorios((l) => l.includes(a) ? l.filter((x) => x !== a) : [...l, a])}
                  className={`rounded-full border px-3 py-1 text-xs ${acessorios.includes(a) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Fotos do aparelho ({fotos.length})</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm hover:bg-muted">
              <Camera className="h-4 w-4" /> {enviando ? "Enviando…" : "Fotografar aparelho"}
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0], "aparelho")} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">3 · Valor e pagamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Valor pago ao vendedor</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label>Preço de revenda</Label>
              <Input value={sugerido} onChange={(e) => setSugerido(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label>Margem prevista</Label>
              <div className={`flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${margem > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                {margem > 0 ? brl(margem) : "—"}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {PAGAMENTOS.map((p) => (
              <label key={p.valor}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${pagamento === p.valor ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="pagamento" className="mt-1"
                  checked={pagamento === p.valor} onChange={() => setPagamento(p.valor)} />
                <span>
                  <span className="font-medium">{p.rotulo}</span>
                  <span className="block text-xs text-muted-foreground">{p.ajuda}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label>Cliente {pagamento === "store_credit" ? "(obrigatório)" : "(opcional)"}</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>{cliente.name}{cliente.cpf_cnpj && ` · ${cliente.cpf_cnpj}`}</span>
                <button onClick={() => setCliente(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Buscar cliente por nome ou CPF" value={buscaCliente}
                  onChange={async (e) => { setBuscaCliente(e.target.value); setClientes(await buscarClientes(e.target.value)); }} />
                {clientes.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
                    {clientes.map((c) => (
                      <button key={c.id} onClick={() => { setCliente(c); setClientes([]); setBuscaCliente(""); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {c.name}{c.cpf_cnpj && ` · ${c.cpf_cnpj}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/estoque/aparelhos")}>Cancelar</Button>
        <Button onClick={salvar} disabled={pendente || enviando}>
          {pendente ? "Registrando…" : "Registrar entrada"}
        </Button>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate, fmtDateTime } from "@/lib/format";
import {
  CHECKLIST_ITENS, TERMO_GARANTIA_PADRAO, TERMO_SERVICO_PADRAO,
  formatarDocumento, formatarEndereco, termoOuPadrao,
} from "@/lib/impressao";
import { BarraImpressao } from "../../barra";

export const metadata = { title: "Imprimir OS" };

type Pessoa = { name?: string; cpf_cnpj?: string; phone?: string; whatsapp?: string } | null;
type Aparelho = { model_text?: string; imei?: string; serial_number?: string; color?: string; capacity?: string } | null;

export default async function ImprimirOsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, companyId, storeId } = await getSessionContext();

  const { data: os } = await supabase
    .from("service_orders")
    .select(`
      id, number, status, reported_issue, symptom_tags, entry_checklist, accessories,
      password_not_given, estimated_price, diagnosis_fee, deadline, warranty_days,
      public_token, created_at, store_id,
      customers(name, cpf_cnpj, phone, whatsapp),
      customer_devices(model_text, imei, serial_number, color, capacity),
      tecnico:technician_id(full_name),
      atendente:created_by(full_name)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!os) notFound();

  const [{ data: empresa }, { data: loja }, { data: termos }] = await Promise.all([
    supabase.from("companies").select("name, trade_name, cnpj, phone, email, address").eq("id", companyId).maybeSingle(),
    supabase.from("stores").select("name, cnpj, phone, address").eq("id", os.store_id ?? storeId).maybeSingle(),
    supabase.from("terms").select("kind, version, body").eq("active", true).in("kind", ["service_term", "warranty_term"])
      .order("version", { ascending: false }),
  ]);

  const termoServico = termos?.find((t) => t.kind === "service_term")?.body;
  const termoGarantia = termos?.find((t) => t.kind === "warranty_term")?.body;
  const clausulas: string[] = termoServico && !/edite em configura/i.test(termoServico)
    ? String(termoServico).split(/\n+/).filter(Boolean)
    : TERMO_SERVICO_PADRAO;
  const garantia = termoOuPadrao(termoGarantia, TERMO_GARANTIA_PADRAO);

  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const linkAcompanhar = os.public_token ? `${origem}/acompanhar/${os.public_token}` : null;

  const cliente = os.customers as Pessoa;
  const aparelho = os.customer_devices as Aparelho;
  const checklist = (os.entry_checklist ?? {}) as Record<string, boolean>;
  const acessorios = (os.accessories ?? []) as string[];
  const sintomas = (os.symptom_tags ?? []) as string[];
  const nomeLoja = empresa?.trade_name || empresa?.name || loja?.name || "Loja";
  const docLoja = formatarDocumento(loja?.cnpj || empresa?.cnpj);
  const enderecoLoja = formatarEndereco(loja?.address as never) || formatarEndereco(empresa?.address as never);
  const telLoja = loja?.phone || empresa?.phone;
  const atendente = (os.atendente as { full_name?: string } | null)?.full_name;

  const vias = ["Via do cliente", "Via da loja"];

  return (
    <>
      <BarraImpressao voltar={`/os/${os.id}`} />
      {vias.map((via) => (
        <section key={via} className="folha folha-a4">
          {/* cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <h1>{nomeLoja}</h1>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {[docLoja && `CNPJ ${docLoja}`, telLoja].filter(Boolean).join(" · ")}
              </div>
              {enderecoLoja && <div className="muted" style={{ fontSize: 11 }}>{enderecoLoja}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="via">{via.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>OS #{os.number}</div>
              <div className="muted" style={{ fontSize: 11 }}>Entrada: {fmtDateTime(os.created_at)}</div>
            </div>
          </div>
          <hr className="linha-sep" />

          <h2>Ordem de serviço — entrada do aparelho</h2>

          {/* cliente e aparelho */}
          <div className="grade2">
            <div className="bloco" style={{ marginTop: 0 }}>
              <div className="rotulo">Cliente</div>
              <div className="valor">{cliente?.name ?? "—"}</div>
              <div style={{ fontSize: 11.5, marginTop: 3 }}>
                {cliente?.cpf_cnpj && <>CPF/CNPJ: {formatarDocumento(cliente.cpf_cnpj)}<br /></>}
                Telefone: {cliente?.whatsapp || cliente?.phone || "—"}
              </div>
            </div>
            <div className="bloco" style={{ marginTop: 0 }}>
              <div className="rotulo">Aparelho</div>
              <div className="valor">{aparelho?.model_text ?? "—"}</div>
              <div style={{ fontSize: 11.5, marginTop: 3 }}>
                {aparelho?.imei ? <>IMEI: {aparelho.imei}<br /></> : aparelho?.serial_number ? <>Série: {aparelho.serial_number}<br /></> : null}
                {[aparelho?.color, aparelho?.capacity].filter(Boolean).join(" · ") || null}
              </div>
            </div>
          </div>

          {/* defeito */}
          <div className="bloco">
            <div className="rotulo">Defeito relatado pelo cliente</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>{os.reported_issue || "—"}</div>
            {sintomas.length > 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Sintomas: {sintomas.join(", ")}</div>
            )}
          </div>

          {/* estado de entrada */}
          <div className="bloco">
            <div className="rotulo" style={{ marginBottom: 5 }}>Estado do aparelho na entrada</div>
            <div className="check">
              {CHECKLIST_ITENS.map(([chave, rotulo]) => (
                <div key={chave}>{checklist[chave] ? "☑" : "☐"} {rotulo}</div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 6 }}>
              <strong>Acessórios deixados:</strong> {acessorios.length ? acessorios.join(", ") : "nenhum"}
              {" · "}
              <strong>Senha:</strong> {os.password_not_given ? "não informada" : "informada ao técnico"}
            </div>
          </div>

          {/* valores e prazo */}
          <div className="grade2" style={{ marginTop: 10 }}>
            <div className="bloco" style={{ marginTop: 0 }}>
              <div className="rotulo">Orçamento estimado</div>
              <div className="valor">{os.estimated_price ? brl(os.estimated_price) : "a definir após diagnóstico"}</div>
              {Number(os.diagnosis_fee) > 0 && (
                <div style={{ fontSize: 11 }}>Taxa de diagnóstico: {brl(os.diagnosis_fee)}</div>
              )}
            </div>
            <div className="bloco" style={{ marginTop: 0 }}>
              <div className="rotulo">Previsão de entrega</div>
              <div className="valor">{os.deadline ? fmtDate(os.deadline) : "a combinar"}</div>
              {atendente && <div style={{ fontSize: 11 }}>Atendido por: {atendente}</div>}
            </div>
          </div>

          {linkAcompanhar && (
            <div className="bloco">
              <div className="rotulo">Acompanhe e aprove o orçamento pelo link</div>
              <div style={{ fontSize: 12, fontWeight: 600, wordBreak: "break-all" }}>{linkAcompanhar}</div>
            </div>
          )}

          {/* termos */}
          <div className="bloco">
            <div className="rotulo" style={{ marginBottom: 4 }}>Condições do serviço</div>
            <ol className="termo" style={{ paddingLeft: 16, margin: 0 }}>
              {clausulas.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
            <div className="termo" style={{ marginTop: 6 }}>
              <strong>Garantia:</strong> {garantia}
            </div>
          </div>

          {/* assinaturas */}
          <div className="assinaturas">
            <div>{cliente?.name ?? "Cliente"}<br /><span className="muted">Assinatura do cliente</span></div>
            <div>{nomeLoja}<br /><span className="muted">Assinatura da loja</span></div>
          </div>
        </section>
      ))}
    </>
  );
}

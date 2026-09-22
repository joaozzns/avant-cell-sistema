import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import {
  TERMO_GARANTIA_PADRAO, formatarDocumento, formatarEndereco, termoOuPadrao,
} from "@/lib/impressao";
import { BarraImpressao } from "../../barra";
import { rotuloPagamento } from "@/lib/pagamentos";

export const metadata = { title: "Imprimir recibo" };

type Item = {
  id: string; qty: number; unit_price: number; discount: number; total: number;
  products: { name?: string } | null;
  serialized_units: { imei1?: string } | null;
};
type Pagamento = { id: string; kind: string; amount: number; installments: number | null; change_given: number | null };

export default async function ImprimirVendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string }>;
}) {
  const { id } = await params;
  const { formato } = await searchParams;
  const a4 = formato === "a4";
  const { supabase, companyId, storeId } = await getSessionContext();

  const { data: venda } = await supabase
    .from("sales")
    .select(`
      id, number, status, subtotal, discount, total, notes, created_at, completed_at, store_id,
      customers(name, cpf_cnpj),
      profiles:seller_id(full_name),
      sale_items(id, qty, unit_price, discount, total, products(name), serialized_units(imei1)),
      sale_payments(id, kind, amount, installments, change_given)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!venda) notFound();

  const [{ data: empresa }, { data: loja }, { data: termos }] = await Promise.all([
    supabase.from("companies").select("name, trade_name, cnpj, phone, address").eq("id", companyId).maybeSingle(),
    supabase.from("stores").select("name, cnpj, phone, address").eq("id", venda.store_id ?? storeId).maybeSingle(),
    supabase.from("terms").select("kind, body, version").eq("active", true)
      .in("kind", ["warranty_term", "exchange_policy"]).order("version", { ascending: false }),
  ]);

  const itens = (venda.sale_items ?? []) as unknown as Item[];
  const pagamentos = (venda.sale_payments ?? []) as unknown as Pagamento[];
  const cliente = venda.customers as { name?: string; cpf_cnpj?: string } | null;
  const vendedor = (venda.profiles as { full_name?: string } | null)?.full_name;
  const nomeLoja = empresa?.trade_name || empresa?.name || loja?.name || "Loja";
  const docLoja = formatarDocumento(loja?.cnpj || empresa?.cnpj);
  const enderecoLoja = formatarEndereco(loja?.address as never) || formatarEndereco(empresa?.address as never);
  const telLoja = loja?.phone || empresa?.phone;
  const temAparelho = itens.some((i) => i.serialized_units?.imei1);
  const garantia = termoOuPadrao(termos?.find((t) => t.kind === "warranty_term")?.body, TERMO_GARANTIA_PADRAO);
  const troca = termoOuPadrao(
    termos?.find((t) => t.kind === "exchange_policy")?.body,
    "Trocas em até 7 dias mediante apresentação deste recibo, com o produto em perfeito estado e na embalagem original.",
  );
  const troco = pagamentos.reduce((s, p) => s + Number(p.change_given ?? 0), 0);
  const cancelada = venda.status === "canceled";

  const opcoes = [
    { rotulo: "Cupom 80mm", href: `/imprimir/venda/${venda.id}`, ativo: !a4 },
    { rotulo: "Folha A4", href: `/imprimir/venda/${venda.id}?formato=a4`, ativo: a4 },
  ];

  return (
    <>
      <BarraImpressao voltar={`/pdv/vendas/${venda.id}`} opcoes={opcoes} />
      <section className={`folha ${a4 ? "folha-a4" : "folha-80"}`} style={a4 ? { fontSize: 12.5 } : undefined}>
        <div className="centro">
          <div style={{ fontSize: a4 ? 20 : 14, fontWeight: 800 }}>{nomeLoja}</div>
          {docLoja && <div>CNPJ {docLoja}</div>}
          {enderecoLoja && <div className="muted">{enderecoLoja}</div>}
          {telLoja && <div className="muted">{telLoja}</div>}
        </div>
        <hr className="tracejado" />

        <div className="centro" style={{ fontWeight: 700 }}>
          RECIBO DE VENDA #{venda.number}
          {cancelada && <div style={{ color: "#b91c1c" }}>VENDA CANCELADA</div>}
        </div>
        <div className="centro muted">{fmtDateTime(venda.completed_at ?? venda.created_at)}</div>
        <hr className="tracejado" />

        {cliente?.name && (
          <div>
            Cliente: <strong>{cliente.name}</strong>
            {cliente.cpf_cnpj && <> · {formatarDocumento(cliente.cpf_cnpj)}</>}
          </div>
        )}
        {vendedor && <div>Vendedor: {vendedor}</div>}
        {(cliente?.name || vendedor) && <hr className="tracejado" />}

        {/* itens */}
        <table>
          <thead>
            <tr style={{ fontSize: a4 ? 11 : 10 }} className="muted">
              <th style={{ textAlign: "left" }}>Item</th>
              <th className="dir">Qtd</th>
              <th className="dir">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.products?.name ?? "Item"}
                  {i.serialized_units?.imei1 && <div className="muted">IMEI {i.serialized_units.imei1}</div>}
                  <div className="muted">
                    {Number(i.qty)} × {brl(i.unit_price)}
                    {Number(i.discount) > 0 && <> · desc. {brl(i.discount)}</>}
                  </div>
                </td>
                <td className="dir">{Number(i.qty)}</td>
                <td className="dir">{brl(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="tracejado" />

        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="dir">{brl(venda.subtotal)}</td></tr>
            {Number(venda.discount) > 0 && (
              <tr><td>Desconto</td><td className="dir">− {brl(venda.discount)}</td></tr>
            )}
            <tr style={{ fontWeight: 800, fontSize: a4 ? 15 : 13 }}>
              <td>TOTAL</td><td className="dir">{brl(venda.total)}</td>
            </tr>
          </tbody>
        </table>
        <hr className="tracejado" />

        {/* pagamentos */}
        <table>
          <tbody>
            {pagamentos.map((p) => (
              <tr key={p.id}>
                <td>
                  {rotuloPagamento(p.kind)}
                  {Number(p.installments) > 1 && <> em {p.installments}x</>}
                </td>
                <td className="dir">{brl(p.amount)}</td>
              </tr>
            ))}
            {troco > 0 && <tr><td>Troco</td><td className="dir">{brl(troco)}</td></tr>}
          </tbody>
        </table>
        <hr className="tracejado" />

        {temAparelho && (
          <p className="termo" style={{ margin: "4px 0" }}><strong>Garantia:</strong> {garantia}</p>
        )}
        <p className="termo" style={{ margin: "4px 0" }}><strong>Trocas:</strong> {troca}</p>
        {venda.notes && <p className="termo" style={{ margin: "4px 0" }}>Obs.: {venda.notes}</p>}

        <hr className="tracejado" />
        <div className="centro muted" style={{ fontSize: a4 ? 11 : 9.5 }}>
          Documento sem valor fiscal
          <br />Obrigado pela preferência!
        </div>

        {a4 && (
          <div className="assinaturas">
            <div>{cliente?.name ?? "Cliente"}<br /><span className="muted">Recebi os produtos acima</span></div>
            <div>{nomeLoja}</div>
          </div>
        )}
      </section>
    </>
  );
}

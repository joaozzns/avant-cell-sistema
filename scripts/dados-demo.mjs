/* Dados de demonstração para a conta de teste.
   uso:  node scripts/dados-demo.mjs semear | limpar
   Usa as mesmas RPCs do sistema (complete_sale, deliver_os, po_receive,
   settle_payable, stock_adjust) para estoque, caixa e financeiro baterem.
   Os IDs criados ficam em scripts/dados-demo-ids.json, que o "limpar" usa. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MANIFESTO = new URL("./dados-demo-ids.json", import.meta.url);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const modo = process.argv[2];
const { data: auth, error: eLogin } = await sb.auth.signInWithPassword({ email: "teste@avantcell.com.br", password: "AvantCell@2026" });
if (eLogin) throw new Error("login: " + eLogin.message);
const userId = auth.user.id;
const { data: vinc } = await sb.from("user_stores").select("store_id, stores(company_id)").eq("user_id", userId).limit(1).single();
const storeId = vinc.store_id, companyId = vinc.stores.company_id;

const ids = existsSync(MANIFESTO) ? JSON.parse(readFileSync(MANIFESTO, "utf8")) : {};
const guarda = (t, id) => { (ids[t] ??= []).push(id); writeFileSync(MANIFESTO, JSON.stringify(ids, null, 2)); return id; };
const ok = (r, ctx) => { if (r.error) throw new Error(`${ctx}: ${r.error.message}`); return r.data; };
const ins = async (t, row) => guarda(t, ok(await sb.from(t).insert(row).select("id").single(), "insert " + t).id);
const rpc = async (fn, args) => ok(await sb.rpc(fn, args), "rpc " + fn);

if (modo === "limpar") {
  const ordem = ["os_quote_items", "os_quotes", "os_diagnostics", "receivables", "payables", "sale_payments", "sale_items", "cash_movements", "sales",
    "service_orders", "customer_devices", "purchase_order_items", "stock_entries", "purchase_orders", "stock_movements", "serialized_units",
    "stock_items", "cash_sessions", "products", "customers", "suppliers", "categories", "brands"];
  for (const t of ordem) {
    if (!ids[t]?.length) continue;
    const r = await sb.from(t).delete().in("id", ids[t]);
    console.log(`  ${t.padEnd(22)} ${r.error ? "ERRO " + r.error.message : ids[t].length + " apagado(s)"}`);
  }
  await sb.auth.signOut(); process.exit(0);
}
if (modo !== "semear") { console.log("uso: semear | limpar"); process.exit(1); }
if (Object.keys(ids).length) { console.log("Já existe um manifesto de dados-demo. Rode 'limpar' antes de semear de novo."); process.exit(1); }

const hoje = new Date();
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const luhn = (b) => { let s = 0; for (let i = 0; i < 14; i++) { let n = +b[i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return b + ((10 - s % 10) % 10); };
const cpf = (b9) => { const dv = (b, p) => { let s = 0; for (const c of b) s += +c * p--; const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(b9, 10); return b9 + d1 + dv(b9 + d1, 11); };
const cont = {};
const conta = (k) => (cont[k] = (cont[k] ?? 0) + 1);

/* ---------------- catálogo ---------------- */
const cat = {};
for (const n of ["Capinhas", "Películas", "Carregadores e cabos", "Fones e áudio", "Telas", "Baterias", "Smartphones"]) cat[n] = await ins("categories", { company_id: companyId, name: n });
const marca = {};
for (const n of ["Apple", "Samsung", "Motorola", "Xiaomi", "Baseus"]) marca[n] = await ins("brands", { company_id: companyId, name: n });

const PRODUTOS = [
  ["DEMO-CAP-IP15", "Capinha iPhone 15 silicone", "accessory", "Capinhas", "Apple", 12, 49.9, 39.9, 34, 8],
  ["DEMO-CAP-S24", "Capinha Galaxy S24 anti-impacto", "accessory", "Capinhas", "Samsung", 11, 44.9, 34.9, 22, 6],
  ["DEMO-CAP-G84", "Capinha Moto G84 transparente", "accessory", "Capinhas", "Motorola", 6, 29.9, 22.9, 3, 5],
  ["DEMO-PEL-3D", "Película 3D vidro temperado", "accessory", "Películas", null, 3.5, 29.9, 19.9, 60, 15],
  ["DEMO-PEL-PRIV", "Película de privacidade", "accessory", "Películas", null, 7, 49.9, 39.9, 4, 10],
  ["DEMO-CAR-20W", "Carregador USB-C 20W", "accessory", "Carregadores e cabos", "Baseus", 28, 89.9, 69.9, 18, 5],
  ["DEMO-CAB-C1M", "Cabo USB-C para Lightning 1m", "accessory", "Carregadores e cabos", "Baseus", 9, 39.9, 29.9, 40, 10],
  ["DEMO-CAB-C2M", "Cabo USB-C 2m reforçado", "accessory", "Carregadores e cabos", "Baseus", 10, 44.9, 34.9, 2, 8],
  ["DEMO-FONE-BT", "Fone Bluetooth TWS", "accessory", "Fones e áudio", "Xiaomi", 55, 149.9, 119.9, 12, 4],
  ["DEMO-TELA-IP11", "Tela iPhone 11 (incell)", "part", "Telas", "Apple", 120, 0, 0, 7, 3],
  ["DEMO-TELA-A54", "Tela Galaxy A54 original", "part", "Telas", "Samsung", 310, 0, 0, 2, 3],
  ["DEMO-BAT-IP12", "Bateria iPhone 12", "part", "Baterias", "Apple", 85, 0, 0, 9, 3],
  ["DEMO-BAT-G60", "Bateria Moto G60", "part", "Baterias", "Motorola", 45, 0, 0, 5, 2],
];
const prod = {};
for (const [codigo, nome, tipo, c, m, custo, preco, minimo, qtd, minQtd] of PRODUTOS) {
  const id = await ins("products", { company_id: companyId, type: tipo, name: nome, internal_code: codigo, category_id: cat[c], brand_id: m ? marca[m] : null,
    cost: custo, sale_price: preco, min_price: minimo, internal_use_only: tipo === "part", warranty_days: tipo === "part" ? 90 : 30 });
  prod[codigo] = id;
  await rpc("stock_adjust", { p_store: storeId, p_product: id, p_variant: null, p_qty: qtd, p_type: "adjustment_in", p_reason: "Dados de demonstração: saldo inicial" });
  const { data: si } = await sb.from("stock_items").update({ min_qty: minQtd }).eq("store_id", storeId).eq("product_id", id).is("variant_id", null).select("id").single();
  if (si) guarda("stock_items", si.id);
  conta("produtos");
}
const servicos = {};
for (const [nome, preco, min] of [["Troca de tela", 0, 60], ["Troca de bateria", 0, 40], ["Limpeza e desoxidação", 120, 45]]) {
  servicos[nome] = await ins("products", { company_id: companyId, type: "service", name: nome, track_stock: false, sale_price: preco, service_minutes: min });
  conta("servicos");
}

const MODELOS = [
  ["iPhone 13 128GB", "Apple", 2350, 3299, [["Meia-noite", "seminew"], ["Estelar", "seminew"]]],
  ["iPhone 14 128GB", "Apple", 3600, 4599, [["Azul", "new"], ["Roxo", "seminew"]]],
  ["Galaxy S23 256GB", "Samsung", 2700, 3499, [["Grafite", "seminew"]]],
  ["Moto G84 256GB", "Motorola", 1150, 1599, [["Grafite", "new"], ["Magenta", "new"], ["Azul", "new"]]],
  ["Redmi Note 13 256GB", "Xiaomi", 980, 1399, [["Preto", "new"], ["Verde", "new"]]],
];
const unidades = [];
let serie = 1;
for (const [nome, m, custo, preco, cores] of MODELOS) {
  const pid = await ins("products", { company_id: companyId, type: "device", name: nome, brand_id: marca[m], category_id: cat["Smartphones"], serialized: true, cost: custo, sale_price: preco, min_price: Math.round(preco * 0.92), warranty_days: 90 });
  for (const [cor, cond] of cores) {
    const imei = luhn("35" + String(482190000000 + serie++).padStart(12, "0"));
    const uid = await ins("serialized_units", { company_id: companyId, store_id: storeId, product_id: pid, imei1: imei, color: cor, capacity: nome.match(/\d+GB/)?.[0], condition: cond, cost: custo, sale_price: preco, origin: "purchase" });
    await ins("stock_movements", { company_id: companyId, store_id: storeId, product_id: pid, unit_id: uid, type: "adjustment_in", qty: 1, unit_cost: custo, reason: "Dados de demonstração" });
    unidades.push({ pid, uid, nome, preco });
    conta("aparelhos");
  }
}

/* ---------------- pessoas ---------------- */
const NOMES = ["Mariana Costa", "Rafael Almeida", "Juliana Ferreira", "Bruno Carvalho", "Camila Rodrigues", "Thiago Martins", "Fernanda Lima", "Lucas Pereira", "Patrícia Souza", "Gustavo Ribeiro", "Aline Barbosa", "Diego Nascimento", "Renata Gomes", "Eduardo Santos"];
const clientes = [];
for (let i = 0; i < NOMES.length; i++) {
  const nasc = i === 0 ? `1994-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}` : `19${80 + (i * 3) % 20}-${String((i % 12) + 1).padStart(2, "0")}-${String((i * 7) % 27 + 1).padStart(2, "0")}`;
  const cel = `(11) 9${String(8100 + i * 37).padStart(4, "0")}-${String(4200 + i * 53).padStart(4, "0")}`;
  clientes.push(await ins("customers", { company_id: companyId, name: NOMES[i], cpf_cnpj: cpf(String(391004000 + i * 7919).slice(0, 9)), whatsapp: cel, phone: cel,
    email: NOMES[i].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(" ", ".") + "@exemplo.com", birthdate: nasc, origin: ["indicação", "redes", "passagem"][i % 3],
    consent_contact: true, consent_at: new Date().toISOString(), address: { city: "São Paulo", state: "SP" }, notes: "Dados de demonstração" }));
  conta("clientes");
}
const fornec = [];
for (const [nome, cnpj, prazo] of [["Distribuidora Conecta Peças", "11222333000181", 2], ["Mega Acessórios Atacado", "45997418000153", 5], ["TecParts Importadora", "04252011000110", 7]]) {
  fornec.push(await ins("suppliers", { company_id: companyId, name: nome, cnpj, lead_time_days: prazo, payment_terms: "30 dias", contact: { vendedor: "Comercial", telefone: "(11) 3000-0000" }, notes: "Dados de demonstração" }));
  conta("fornecedores");
}

/* ---------------- compras ---------------- */
const { data: n1 } = await sb.rpc("next_store_number", { p_store: storeId, p_kind: "purchase_order" });
const po1 = await ins("purchase_orders", { company_id: companyId, store_id: storeId, supplier_id: fornec[0], number: n1, status: "sent", total: 1340, created_by: userId, notes: "Reposição de telas e baterias" });
const it1 = await ins("purchase_order_items", { po_id: po1, product_id: prod["DEMO-TELA-IP11"], qty: 6, unit_cost: 115 });
const it2 = await ins("purchase_order_items", { po_id: po1, product_id: prod["DEMO-BAT-IP12"], qty: 8, unit_cost: 81.25 });
const rec = await rpc("po_receive", { p: { po_id: po1, invoice_number: "NF 48213", items: [{ item_id: it1, qty_received: 6, unit_cost: 115 }, { item_id: it2, qty_received: 8, unit_cost: 81.25 }] } });
conta("pedidos_recebidos");
const { data: entr } = await sb.from("stock_entries").select("id").eq("purchase_order_id", po1); (entr ?? []).forEach((e) => guarda("stock_entries", e.id));
const { data: pagPo } = await sb.from("payables").select("id").eq("po_id", po1); (pagPo ?? []).forEach((p) => guarda("payables", p.id));
const { data: n2 } = await sb.rpc("next_store_number", { p_store: storeId, p_kind: "purchase_order" });
const po2 = await ins("purchase_orders", { company_id: companyId, store_id: storeId, supplier_id: fornec[1], number: n2, status: "sent", total: 890, expected_at: dia(4), created_by: userId, notes: "Capinhas e películas" });
await ins("purchase_order_items", { po_id: po2, product_id: prod["DEMO-CAP-G84"], qty: 30, unit_cost: 6 });
await ins("purchase_order_items", { po_id: po2, product_id: prod["DEMO-PEL-PRIV"], qty: 40, unit_cost: 7.25 });
conta("pedidos_em_aberto");

/* ---------------- financeiro ---------------- */
const { data: cats } = await sb.from("finance_categories").select("id, name").eq("company_id", companyId);
const catDesp = cats.find((c) => c.name === "Despesas operacionais")?.id, catAdm = cats.find((c) => c.name === "Despesas administrativas")?.id;
const { data: contaCaixa } = await sb.from("accounts").select("id").eq("company_id", companyId).eq("type", "cash").limit(1).single();
const CONTAS = [["Aluguel da loja", dia(-1), 3200, catAdm], ["Energia elétrica", dia(0), 486.7, catDesp], ["Internet e telefone", dia(6), 219.9, catDesp], ["Contador", dia(12), 650, catAdm], ["Sistema de câmeras", dia(-8), 149.9, catDesp]];
const payIds = [];
for (const [d, venc, v, c] of CONTAS) { payIds.push(await ins("payables", { company_id: companyId, store_id: storeId, description: d, due_date: venc, amount: v, category_id: c, created_by: userId })); conta("contas_a_pagar"); }
await rpc("settle_payable", { p_id: payIds[4], p_amount: 149.9, p_account: contaCaixa.id });

/* ---------------- caixa e vendas ---------------- */
const { data: caixaAberto } = await sb.from("cash_sessions").select("id").eq("store_id", storeId).eq("opened_by", userId).eq("status", "open").maybeSingle();
const sessao = caixaAberto?.id ?? await ins("cash_sessions", { company_id: companyId, store_id: storeId, opened_by: userId, opening_amount: 200 });
const { data: metodos } = await sb.from("payment_methods").select("id, kind").eq("company_id", companyId);
const met = Object.fromEntries(metodos.map((m) => [m.kind, m.id]));
const vendas = [];
const vender = async (cliente, itens, pagamentos, notes) => {
  const total = itens.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const r = await rpc("complete_sale", { p: { store_id: storeId, cash_session_id: sessao, customer_id: cliente, discount: 0, notes,
    items: itens, payments: pagamentos.map(([kind, frac, inst]) => ({ kind, method_id: met[kind], amount: Math.round(total * frac * 100) / 100, installments: inst ?? 1 })) } });
  guarda("sales", r.sale_id); vendas.push(r.sale_id); conta("vendas"); return r;
};
const item = (codigo, qty) => { const p = PRODUTOS.find((x) => x[0] === codigo); return { product_id: prod[codigo], qty, unit_price: p[6] }; };
await vender(clientes[1], [item("DEMO-CAP-IP15", 1), item("DEMO-PEL-3D", 1)], [["pix", 1]]);
await vender(null, [item("DEMO-CAB-C1M", 2)], [["cash", 1]]);
await vender(clientes[2], [{ product_id: unidades[0].pid, unit_id: unidades[0].uid, qty: 1, unit_price: unidades[0].preco }, item("DEMO-PEL-3D", 1)], [["credit_installments", 1, 10]]);
await vender(clientes[3], [item("DEMO-FONE-BT", 1)], [["debit", 1]]);
await vender(clientes[4], [item("DEMO-CAR-20W", 1), item("DEMO-CAB-C1M", 1)], [["pix", 1]]);
await vender(clientes[5], [{ product_id: unidades[5].pid, unit_id: unidades[5].uid, qty: 1, unit_price: unidades[5].preco }], [["credit_plan", 1, 3]]);
await vender(null, [item("DEMO-PEL-3D", 2), item("DEMO-CAP-S24", 1)], [["cash", 1]]);
await vender(clientes[6], [item("DEMO-CAP-S24", 1)], [["credit", 1]]);
await vender(clientes[7], [{ product_id: unidades[8].pid, unit_id: unidades[8].uid, qty: 1, unit_price: unidades[8].preco }], [["pix", 0.5], ["credit_installments", 0.5, 3]]);
await vender(clientes[8], [item("DEMO-FONE-BT", 1), item("DEMO-PEL-3D", 1)], [["pix", 1]]);
await vender(null, [item("DEMO-CAB-C2M", 1)], [["cash", 1]]);
await vender(clientes[9], [item("DEMO-CAR-20W", 1)], [["debit", 1]]);
const { data: recs } = await sb.from("receivables").select("id").in("sale_id", vendas); (recs ?? []).forEach((r) => guarda("receivables", r.id));
for (const tabela of ["sale_items", "sale_payments"]) { const { data } = await sb.from(tabela).select("id").in("sale_id", vendas); (data ?? []).forEach((r) => guarda(tabela, r.id)); }
const { data: movs } = await sb.from("cash_movements").select("id").eq("session_id", sessao); (movs ?? []).forEach((m) => guarda("cash_movements", m.id));

/* distribui metade das vendas nos últimos dias, para relatórios e DRE terem série */
let recuo = 0, datasOk = 0;
for (const [k, v] of vendas.slice(0, 6).entries()) {
  recuo += [1, 2, 3, 5, 8, 13][k];
  const quando = new Date(Date.now() - recuo * 86400000 + 3 * 3600000).toISOString();
  const r = await sb.from("sales").update({ created_at: quando, completed_at: quando }).eq("id", v).select("id");
  if (!r.error && r.data?.length) datasOk++;
}

/* ---------------- assistência técnica ---------------- */
const CAMINHO = ["open", "diagnosing", "awaiting_approval", "approved", "repairing", "testing", "ready"];
const OS = [
  ["Tela quebrada após queda, touch falhando", "iPhone 11", "Apple", "ready", 2, "Troca de tela", 450, "DEMO-TELA-IP11"],
  ["Bateria descarregando rápido", "iPhone 12", "Apple", "testing", 3, "Troca de bateria", 320, "DEMO-BAT-IP12"],
  ["Não carrega, conector com mau contato", "Moto G60", "Motorola", "repairing", 1, "Limpeza e desoxidação", 180, null],
  ["Caiu na água, não liga", "Galaxy A54", "Samsung", "awaiting_approval", 2, "Troca de tela", 890, "DEMO-TELA-A54"],
  ["Câmera traseira embaçada", "Redmi Note 12", "Xiaomi", "diagnosing", -1, null, null, null],
  ["Alto-falante sem som em ligações", "iPhone 13", "Apple", "open", 4, null, null, null],
  ["Tela com manchas e linhas verdes", "Galaxy S21", "Samsung", "approved", -2, "Troca de tela", 1150, null],
  ["Troca de bateria preventiva", "iPhone 11", "Apple", "delivered", -3, "Troca de bateria", 290, null],
];
for (const [k, [problema, modelo, mk, alvo, prazo, servico, valor, peca]] of OS.entries()) {
  const cliente = clientes[(k + 3) % clientes.length];
  const dev = await ins("customer_devices", { company_id: companyId, customer_id: cliente, brand_id: marca[mk], model_text: `${mk} ${modelo}`,
    imei: luhn("35" + String(771230000000 + k).padStart(12, "0")), color: ["Preto", "Branco", "Azul"][k % 3] });
  const num = ok(await sb.rpc("next_store_number", { p_store: storeId, p_kind: "service_order" }), "numero OS");
  const os = await ins("service_orders", { company_id: companyId, store_id: storeId, number: num, customer_id: cliente, customer_device_id: dev,
    reported_issue: problema, priority: k % 4 === 0 ? "urgent" : "normal", deadline: new Date(Date.now() + prazo * 86400000).toISOString(),
    estimated_price: valor, entry_checklist: { liga: !problema.includes("não liga"), tela: !problema.toLowerCase().includes("tela") }, accessories: ["capinha"], created_by: userId });
  const destino = alvo === "delivered" ? "ready" : alvo;
  let quote = null;
  for (let i = 1; i <= CAMINHO.indexOf(destino); i++) {
    const para = CAMINHO[i];
    if (para === "awaiting_approval") {
      await ins("os_diagnostics", { os_id: os, found_issue: problema, procedure: servico ? `${servico} com teste completo` : "Análise em bancada", technician_id: userId, repair_estimate_minutes: 60 });
      quote = await ins("os_quotes", { os_id: os, version: 1, status: "sent", total: valor, valid_until: dia(7), execution_days: 2, sent_at: new Date().toISOString() });
      if (peca) await ins("os_quote_items", { quote_id: quote, kind: "part", product_id: prod[peca], description: `Peça: ${PRODUTOS.find((x) => x[0] === peca)[1]}`, qty: 1, unit_price: Math.round(valor * 0.6) });
      await ins("os_quote_items", { quote_id: quote, kind: "labor", product_id: servicos[servico], description: `Mão de obra: ${servico}`, qty: 1, unit_price: peca ? valor - Math.round(valor * 0.6) : valor });
    }
    if (para === "approved") await sb.from("os_quotes").update({ status: "approved", decided_at: new Date().toISOString(), approval_channel: "in_person" }).eq("id", quote);
    ok(await sb.from("service_orders").update({ status: para }).eq("id", os).select("id"), `OS ${num} -> ${para}`);
  }
  if (alvo === "delivered") {
    const r = await rpc("deliver_os", { p: { os_id: os, delivered_to: "Titular", payments: [{ kind: "pix", amount: valor }] } });
    guarda("sales", r.sale_id);
    for (const tabela of ["sale_items", "sale_payments"]) { const { data } = await sb.from(tabela).select("id").eq("sale_id", r.sale_id); (data ?? []).forEach((x) => guarda(tabela, x.id)); }
  }
  const { data: qi } = quote ? await sb.from("os_quote_items").select("id").eq("quote_id", quote) : { data: [] };
  conta("os_" + alvo);
}
const { data: diag } = await sb.from("os_diagnostics").select("id").in("os_id", ids.service_orders ?? []); (diag ?? []).forEach((d) => { if (!ids.os_diagnostics?.includes(d.id)) guarda("os_diagnostics", d.id); });
const { data: mvSaida } = await sb.from("stock_movements").select("id").in("ref_id", ids.sales ?? []); (mvSaida ?? []).forEach((m) => guarda("stock_movements", m.id));

console.log("criado:", JSON.stringify(cont));
console.log("vendas redatadas nos últimos dias:", datasOk, "de 6");
console.log("manifesto:", Object.entries(ids).map(([t, v]) => `${t}=${v.length}`).join(" "));
await sb.auth.signOut();

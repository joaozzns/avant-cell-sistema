/* Regras do importador de dados, compartilhadas entre o navegador (pré-visualização)
   e o servidor (gravação). O servidor sempre revalida: o que o navegador mostra é
   uma prévia, não uma garantia. Nada aqui importa código de servidor. */

export type Tipo = "produtos" | "clientes" | "fornecedores" | "aparelhos";

export type Campo = {
  chave: string;
  rotulo: string;
  obrigatorio?: boolean;
  /* nomes de coluna que outros sistemas costumam usar para o mesmo dado */
  sinonimos: string[];
  exemplo: string;
};

export const TIPOS: { tipo: Tipo; titulo: string; descricao: string }[] = [
  { tipo: "produtos", titulo: "Produtos e estoque", descricao: "Catálogo com preços, categorias, marcas e saldo inicial." },
  { tipo: "clientes", titulo: "Clientes", descricao: "Cadastro com CPF/CNPJ, contatos, nascimento e endereço." },
  { tipo: "fornecedores", titulo: "Fornecedores", descricao: "Distribuidores e fornecedores de peças e aparelhos." },
  { tipo: "aparelhos", titulo: "Aparelhos com IMEI", descricao: "Unidades em estoque, uma por linha, com IMEI validado." },
];

export const CAMPOS: Record<Tipo, Campo[]> = {
  produtos: [
    { chave: "nome", rotulo: "Nome", obrigatorio: true, sinonimos: ["nome", "produto", "descricao do produto", "nome do produto", "item", "titulo"], exemplo: "Capinha iPhone 15 silicone" },
    { chave: "codigo", rotulo: "Código interno", sinonimos: ["codigo", "cod", "codigo interno", "sku", "referencia", "ref", "id produto"], exemplo: "CAP-IP15-SIL" },
    { chave: "ean", rotulo: "Código de barras (EAN)", sinonimos: ["ean", "gtin", "codigo de barras", "cod barras", "barcode"], exemplo: "7891234567895" },
    { chave: "tipo", rotulo: "Tipo", sinonimos: ["tipo", "tipo produto", "tipo de produto"], exemplo: "acessório" },
    { chave: "categoria", rotulo: "Categoria", sinonimos: ["categoria", "grupo", "departamento", "familia", "secao"], exemplo: "Capinhas" },
    { chave: "marca", rotulo: "Marca", sinonimos: ["marca", "fabricante"], exemplo: "Apple" },
    { chave: "custo", rotulo: "Custo", sinonimos: ["custo", "preco de custo", "valor de custo", "vl custo", "custo unitario"], exemplo: "12,50" },
    { chave: "preco", rotulo: "Preço de venda", sinonimos: ["preco", "preco de venda", "valor", "valor de venda", "vl venda", "pv", "preco venda"], exemplo: "39,90" },
    { chave: "preco_minimo", rotulo: "Preço mínimo", sinonimos: ["preco minimo", "valor minimo", "minimo"], exemplo: "29,90" },
    { chave: "estoque", rotulo: "Estoque atual", sinonimos: ["estoque", "quantidade", "qtd", "qtde", "saldo", "estoque atual", "qtd estoque"], exemplo: "25" },
    { chave: "estoque_minimo", rotulo: "Estoque mínimo", sinonimos: ["estoque minimo", "minimo estoque", "qtd minima", "est minimo"], exemplo: "5" },
    { chave: "garantia_dias", rotulo: "Garantia (dias)", sinonimos: ["garantia", "garantia dias", "dias de garantia"], exemplo: "90" },
    { chave: "controla_imei", rotulo: "Controla IMEI/série", sinonimos: ["controla imei", "imei", "serializado", "controla serie"], exemplo: "não" },
    { chave: "descricao", rotulo: "Descrição", sinonimos: ["descricao", "observacao", "obs", "detalhes"], exemplo: "Silicone com interior aveludado" },
  ],
  clientes: [
    { chave: "nome", rotulo: "Nome", obrigatorio: true, sinonimos: ["nome", "cliente", "nome do cliente", "razao social", "nome completo"], exemplo: "Maria Oliveira" },
    { chave: "cpf_cnpj", rotulo: "CPF/CNPJ", sinonimos: ["cpf", "cnpj", "cpf cnpj", "cpfcnpj", "documento", "doc"], exemplo: "123.456.789-09" },
    { chave: "telefone", rotulo: "Telefone", sinonimos: ["telefone", "fone", "tel", "telefone fixo"], exemplo: "(11) 3333-4444" },
    { chave: "whatsapp", rotulo: "WhatsApp/Celular", sinonimos: ["whatsapp", "celular", "cel", "zap", "whats", "telefone celular"], exemplo: "(11) 98888-7777" },
    { chave: "email", rotulo: "E-mail", sinonimos: ["email", "e mail", "correio eletronico"], exemplo: "maria@email.com" },
    { chave: "nascimento", rotulo: "Nascimento", sinonimos: ["nascimento", "data de nascimento", "dt nascimento", "aniversario", "data nasc"], exemplo: "15/03/1990" },
    { chave: "cep", rotulo: "CEP", sinonimos: ["cep"], exemplo: "01310-100" },
    { chave: "rua", rotulo: "Endereço", sinonimos: ["endereco", "rua", "logradouro"], exemplo: "Av. Paulista" },
    { chave: "numero", rotulo: "Número", sinonimos: ["numero", "num", "nro"], exemplo: "1000" },
    { chave: "bairro", rotulo: "Bairro", sinonimos: ["bairro"], exemplo: "Bela Vista" },
    { chave: "cidade", rotulo: "Cidade", sinonimos: ["cidade", "municipio"], exemplo: "São Paulo" },
    { chave: "uf", rotulo: "UF", sinonimos: ["uf", "estado"], exemplo: "SP" },
    { chave: "observacoes", rotulo: "Observações", sinonimos: ["observacoes", "observacao", "obs", "anotacoes"], exemplo: "Cliente desde 2021" },
  ],
  fornecedores: [
    { chave: "nome", rotulo: "Nome", obrigatorio: true, sinonimos: ["nome", "fornecedor", "razao social", "nome fantasia", "empresa"], exemplo: "Distribuidora Tech" },
    { chave: "cnpj", rotulo: "CNPJ", sinonimos: ["cnpj", "cpf cnpj", "documento"], exemplo: "11.222.333/0001-81" },
    { chave: "vendedor", rotulo: "Contato/Vendedor", sinonimos: ["contato", "vendedor", "representante", "responsavel"], exemplo: "Carlos" },
    { chave: "telefone", rotulo: "Telefone", sinonimos: ["telefone", "fone", "tel", "whatsapp", "celular"], exemplo: "(11) 97777-6666" },
    { chave: "email", rotulo: "E-mail", sinonimos: ["email", "e mail"], exemplo: "vendas@distribuidora.com" },
    { chave: "prazo_pagamento", rotulo: "Prazo de pagamento", sinonimos: ["prazo de pagamento", "condicao de pagamento", "prazo pagamento", "condicoes"], exemplo: "30/60 dias" },
    { chave: "prazo_entrega", rotulo: "Prazo de entrega (dias)", sinonimos: ["prazo de entrega", "prazo entrega", "lead time", "entrega dias"], exemplo: "3" },
    { chave: "observacoes", rotulo: "Observações", sinonimos: ["observacoes", "observacao", "obs"], exemplo: "Entrega na loja" },
  ],
  aparelhos: [
    { chave: "modelo", rotulo: "Modelo", obrigatorio: true, sinonimos: ["modelo", "aparelho", "produto", "descricao", "nome"], exemplo: "iPhone 13 128GB" },
    { chave: "imei1", rotulo: "IMEI", obrigatorio: true, sinonimos: ["imei", "imei1", "imei 1"], exemplo: "356938035643809" },
    { chave: "imei2", rotulo: "IMEI 2", sinonimos: ["imei2", "imei 2"], exemplo: "" },
    { chave: "serie", rotulo: "Número de série", sinonimos: ["serie", "numero de serie", "serial", "sn", "n serie"], exemplo: "F2LXK0ABCD" },
    { chave: "cor", rotulo: "Cor", sinonimos: ["cor"], exemplo: "Meia-noite" },
    { chave: "capacidade", rotulo: "Capacidade", sinonimos: ["capacidade", "armazenamento", "memoria", "gb"], exemplo: "128GB" },
    { chave: "condicao", rotulo: "Condição", sinonimos: ["condicao", "estado", "estado do aparelho", "conservacao"], exemplo: "seminovo" },
    { chave: "marca", rotulo: "Marca", sinonimos: ["marca", "fabricante"], exemplo: "Apple" },
    { chave: "custo", rotulo: "Custo", sinonimos: ["custo", "preco de custo", "valor de compra", "valor pago"], exemplo: "2.100,00" },
    { chave: "preco", rotulo: "Preço de venda", sinonimos: ["preco", "preco de venda", "valor de venda", "valor"], exemplo: "2.899,00" },
  ],
};

/* ---------------------------------------------------------------- texto */

export function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const texto = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/* Casa as colunas da planilha com os campos: primeiro nome idêntico, depois
   um sinônimo contido no cabeçalho ("Preço de venda (R$)" -> preco). Cada
   coluna é usada uma vez só. */
export function mapearColunas(cabecalho: string[], tipo: Tipo): Record<string, number> {
  const mapa: Record<string, number> = {};
  const usadas = new Set<number>();
  const colunas = cabecalho.map(normalizar);
  const campos = CAMPOS[tipo];

  for (const passo of ["exato", "contem"] as const) {
    for (const campo of campos) {
      if (campo.chave in mapa) continue;
      const alvos = campo.sinonimos.map(normalizar);
      /* sinônimos mais longos primeiro: "preco de custo" antes de "preco" */
      alvos.sort((a, b) => b.length - a.length);
      for (const alvo of alvos) {
        const i = colunas.findIndex((c, idx) =>
          !usadas.has(idx) && (passo === "exato" ? c === alvo : c.includes(alvo))
        );
        if (i >= 0) {
          mapa[campo.chave] = i;
          usadas.add(i);
          break;
        }
      }
    }
  }
  return mapa;
}

/* ---------------------------------------------------------------- CSV */

function contarSeparador(linha: string, sep: string) {
  let n = 0, aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) n++;
  }
  return n;
}

/* Planilhas brasileiras saem com ";" (a vírgula é o decimal); exportações de
   sistemas costumam usar ","; algumas, tabulação. Detectamos pela 1ª linha. */
export function lerCsv(conteudo: string): string[][] {
  const t = conteudo.replace(/^﻿/, "");
  const primeira = t.slice(0, t.search(/\r?\n/) >>> 0 || t.length);
  const sep = [";", ",", "\t", "|"]
    .map((s) => [s, contarSeparador(primeira, s)] as const)
    .sort((a, b) => b[1] - a[1])[0][0];

  const linhas: string[][] = [];
  let linha: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

export function modeloCsv(tipo: Tipo): string {
  const campos = CAMPOS[tipo];
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [campos.map((c) => esc(c.rotulo)).join(";"), campos.map((c) => esc(c.exemplo)).join(";")].join("\r\n") + "\r\n";
}

/* ---------------------------------------------------------------- valores */

/* Aceita "R$ 1.234,56", "1234,56", "1,234.56", "1234.56" e números vindos do Excel. */
export function numeroBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$\s]/g, "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;
  const ultPonto = s.lastIndexOf("."), ultVirg = s.lastIndexOf(",");
  if (ultPonto >= 0 && ultVirg >= 0) {
    s = ultVirg > ultPonto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ultVirg >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (ultPonto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); /* "1.500" é mil e quinhentos */
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* dd/mm/aaaa, aaaa-mm-dd, datas do Excel (objeto ou número de série). */
export function dataISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  let a: number, mes: number, d: number;
  if (m) {
    d = +m[1]; mes = +m[2]; a = +m[3];
    if (a < 100) a += a > 30 ? 1900 : 2000;
  } else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    a = +m[1]; mes = +m[2]; d = +m[3];
  } else return null;
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function simNao(v: unknown): boolean | null {
  const s = normalizar(v);
  if (!s) return null;
  if (["sim", "s", "yes", "y", "true", "verdadeiro", "1", "x"].includes(s)) return true;
  if (["nao", "n", "no", "false", "falso", "0"].includes(s)) return false;
  return null;
}

export function imeiValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let n = +imei[i];
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    soma += n;
  }
  return soma % 10 === 0;
}

function cpfValido(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string, peso: number) => {
    let s = 0;
    for (const ch of base) s += +ch * peso--;
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === +c[9] && dv(c.slice(0, 10), 11) === +c[10];
}

function cnpjValido(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const s = [...base].reduce((acc, ch, i) => acc + +ch * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === +c[12] && dv(c.slice(0, 13)) === +c[13];
}

export function documentoValido(d: string) {
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

function tipoProduto(v: unknown): "device" | "accessory" | "part" | "service" | null {
  const s = normalizar(v);
  if (!s) return null;
  if (/aparelho|celular|smartphone|telefone|device|iphone/.test(s)) return "device";
  if (/peca|part|componente|tela|bateria/.test(s)) return "part";
  if (/servico|service|mao de obra/.test(s)) return "service";
  if (/acessorio|accessory/.test(s)) return "accessory";
  return null;
}

function condicao(v: unknown): "new" | "seminew" | "showcase" | "used" | null {
  const s = normalizar(v);
  if (!s) return null;
  if (/semi/.test(s)) return "seminew";
  if (/vitrine|mostruario|showcase/.test(s)) return "showcase";
  if (/usado|used/.test(s)) return "used";
  if (/novo|lacrado|new/.test(s)) return "new";
  return null;
}

/* ---------------------------------------------------------------- validação */

export type LinhaValidada = {
  dados: Record<string, string | number | boolean | null>;
  erros: string[];
  avisos: string[];
};

export function validarLinha(tipo: Tipo, bruto: Record<string, unknown>): LinhaValidada {
  const erros: string[] = [];
  const avisos: string[] = [];
  const d: LinhaValidada["dados"] = {};

  for (const c of CAMPOS[tipo]) {
    if (c.obrigatorio && texto(bruto[c.chave]) === null) erros.push(`${c.rotulo} é obrigatório.`);
  }

  const dinheiro = (chave: string, rotulo: string) => {
    const bruta = bruto[chave];
    if (texto(bruta) === null && typeof bruta !== "number") return null;
    const n = numeroBR(bruta);
    if (n === null) { avisos.push(`${rotulo} "${bruta}" não é um número — ignorado.`); return null; }
    if (n < 0) { avisos.push(`${rotulo} negativo — ignorado.`); return null; }
    return Math.round(n * 100) / 100;
  };

  if (tipo === "produtos") {
    d.nome = texto(bruto.nome);
    d.codigo = texto(bruto.codigo);
    const ean = soDigitos(bruto.ean);
    if (ean && ![8, 12, 13, 14].includes(ean.length)) avisos.push(`EAN "${bruto.ean}" com tamanho incomum — ignorado.`);
    d.ean = ean && [8, 12, 13, 14].includes(ean.length) ? ean : null;
    const tp = tipoProduto(bruto.tipo);
    if (texto(bruto.tipo) && !tp) avisos.push(`Tipo "${bruto.tipo}" não reconhecido — cadastrado como acessório.`);
    d.tipo = tp ?? "accessory";
    d.categoria = texto(bruto.categoria);
    d.marca = texto(bruto.marca);
    d.custo = dinheiro("custo", "Custo");
    d.preco = dinheiro("preco", "Preço");
    d.preco_minimo = dinheiro("preco_minimo", "Preço mínimo");
    if (d.preco !== null && d.custo !== null && (d.preco as number) < (d.custo as number) && (d.preco as number) > 0) {
      avisos.push("Preço de venda abaixo do custo.");
    }
    const est = texto(bruto.estoque) !== null || typeof bruto.estoque === "number" ? numeroBR(bruto.estoque) : null;
    if (est !== null && est < 0) avisos.push("Estoque negativo — ignorado.");
    d.estoque = est !== null && est >= 0 ? est : null;
    const min = texto(bruto.estoque_minimo) !== null || typeof bruto.estoque_minimo === "number" ? numeroBR(bruto.estoque_minimo) : null;
    d.estoque_minimo = min !== null && min >= 0 ? min : null;
    const gar = numeroBR(bruto.garantia_dias);
    d.garantia_dias = gar !== null && gar >= 0 ? Math.round(gar) : null;
    d.controla_imei = simNao(bruto.controla_imei) ?? d.tipo === "device";
    d.descricao = texto(bruto.descricao);
    if (d.tipo === "service" && d.estoque) avisos.push("Serviço não controla estoque — quantidade ignorada.");
    if (d.controla_imei && d.estoque) {
      avisos.push("Produto com IMEI: o saldo não entra por quantidade. Importe as unidades em \"Aparelhos com IMEI\".");
      d.estoque = null;
    }
  }

  if (tipo === "clientes") {
    d.nome = texto(bruto.nome);
    const doc = soDigitos(bruto.cpf_cnpj);
    if (doc && !documentoValido(doc)) {
      avisos.push(`CPF/CNPJ "${bruto.cpf_cnpj}" inválido — cliente importado sem documento.`);
      d.cpf_cnpj = null;
    } else d.cpf_cnpj = doc || null;
    d.tipo_pessoa = doc.length === 14 && d.cpf_cnpj ? "company" : "person";
    d.telefone = texto(bruto.telefone);
    d.whatsapp = texto(bruto.whatsapp);
    const email = texto(bruto.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      avisos.push(`E-mail "${email}" inválido — ignorado.`);
      d.email = null;
    } else d.email = email ? email.toLowerCase() : null;
    if (texto(bruto.nascimento) !== null || bruto.nascimento instanceof Date || typeof bruto.nascimento === "number") {
      const nasc = dataISO(bruto.nascimento);
      if (!nasc) avisos.push(`Data de nascimento "${bruto.nascimento}" não reconhecida — ignorada.`);
      d.nascimento = nasc;
    } else d.nascimento = null;
    d.cep = soDigitos(bruto.cep) || null;
    d.rua = texto(bruto.rua);
    d.numero = texto(bruto.numero);
    d.bairro = texto(bruto.bairro);
    d.cidade = texto(bruto.cidade);
    const uf = texto(bruto.uf);
    d.uf = uf ? uf.toUpperCase().slice(0, 2) : null;
    d.observacoes = texto(bruto.observacoes);
  }

  if (tipo === "fornecedores") {
    d.nome = texto(bruto.nome);
    const doc = soDigitos(bruto.cnpj);
    if (doc && !documentoValido(doc)) {
      avisos.push(`CNPJ "${bruto.cnpj}" inválido — fornecedor importado sem documento.`);
      d.cnpj = null;
    } else d.cnpj = doc || null;
    d.vendedor = texto(bruto.vendedor);
    d.telefone = texto(bruto.telefone);
    d.email = texto(bruto.email);
    d.prazo_pagamento = texto(bruto.prazo_pagamento);
    const pe = numeroBR(bruto.prazo_entrega);
    d.prazo_entrega = pe !== null && pe >= 0 ? Math.round(pe) : null;
    d.observacoes = texto(bruto.observacoes);
  }

  if (tipo === "aparelhos") {
    d.modelo = texto(bruto.modelo);
    const imei1 = soDigitos(bruto.imei1);
    if (texto(bruto.imei1) !== null && !imeiValido(imei1)) {
      erros.push(`IMEI "${bruto.imei1}" inválido (15 dígitos com dígito verificador).`);
    }
    d.imei1 = imei1 || null;
    const imei2 = soDigitos(bruto.imei2);
    if (imei2 && !imeiValido(imei2)) {
      avisos.push(`IMEI 2 "${bruto.imei2}" inválido — ignorado.`);
      d.imei2 = null;
    } else d.imei2 = imei2 || null;
    if (d.imei1 && d.imei1 === d.imei2) d.imei2 = null;
    d.serie = texto(bruto.serie);
    d.cor = texto(bruto.cor);
    d.capacidade = texto(bruto.capacidade);
    const cond = condicao(bruto.condicao);
    if (texto(bruto.condicao) && !cond) avisos.push(`Condição "${bruto.condicao}" não reconhecida — cadastrado como novo.`);
    d.condicao = cond ?? "new";
    d.marca = texto(bruto.marca);
    d.custo = dinheiro("custo", "Custo");
    d.preco = dinheiro("preco", "Preço");
  }

  return { dados: d, erros, avisos };
}

/* Chave que identifica o mesmo registro duas vezes na planilha. Sem documento
   nem e-mail não há como afirmar que dois clientes "João" são a mesma pessoa,
   então nesses casos não deduplicamos. */
export function chaveDuplicidade(tipo: Tipo, d: LinhaValidada["dados"]): string | null {
  const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  switch (tipo) {
    case "produtos":
      return s(d.codigo) ? `cod:${d.codigo}` : s(d.ean) ? `ean:${d.ean}` : s(d.nome) ? `nome:${normalizar(d.nome)}` : null;
    case "clientes":
      return s(d.cpf_cnpj) ? `doc:${d.cpf_cnpj}` : s(d.email) ? `email:${d.email}` : null;
    case "fornecedores":
      return s(d.cnpj) ? `doc:${d.cnpj}` : s(d.nome) ? `nome:${normalizar(d.nome)}` : null;
    case "aparelhos":
      return s(d.imei1) ? `imei:${d.imei1}` : null;
  }
}

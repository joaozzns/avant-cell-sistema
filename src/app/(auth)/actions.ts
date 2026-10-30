"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Depois de entrar ou criar a conta a partir de um link de convite, a pessoa
   ja cai na equipe. Se o convite nao servir (expirou, e-mail diferente...),
   volta para a pagina do convite com o motivo. */
async function seguirConvite(supabase: Awaited<ReturnType<typeof createClient>>, token: string) {
  const { error } = await supabase.rpc("invite_accept", { p_token: token });
  revalidatePath("/", "layout");
  if (error) redirect(`/convite/${token}?erro=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function login(_prev: { error?: string }, formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const convite = String(formData.get("convite") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }
  if (TOKEN.test(convite)) await seguirConvite(supabase, convite);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/* Guarda só os dígitos: o cliente digita (31) 9 9999-9999, com ponto, traço
 * ou espaço, e o que serve para mandar mensagem depois é o número limpo. */
const soNumeros = (v: string) => v.replace(/\D/g, "");

/* Celular brasileiro tem 11 dígitos com DDD, fixo tem 10. Aceita os dois e
 * recusa o resto antes de criar a conta — telefone errado no cadastro é um
 * cliente que ninguém consegue alcançar depois. */
function conferirTelefone(valor: string): string | null {
  const n = soNumeros(valor);
  if (!n) return "Informe um telefone com DDD.";
  if (n.length < 10) return "Telefone incompleto. Digite com DDD: (31) 99999-9999.";
  if (n.length > 11) return "Telefone com dígitos demais. Use só DDD e número.";
  if (/^(\d)\1+$/.test(n)) return "Esse telefone não parece válido.";
  return null;
}

/* A regra de senha é do Supabase, não nossa: ele exige minúscula, MAIÚSCULA,
 * número e símbolo. A tela dizia "mínimo 8 caracteres, com letra e número" e a
 * validação daqui conferia só isso — então uma senha que passava nos dois era
 * recusada lá, e o cliente levava a resposta crua do Supabase, em inglês, com
 * a tabela de símbolos inteira no meio. Era a primeira tela do sistema.
 *
 * Agora a regra é conferida aqui, com a mesma exigência, e a mensagem diz o
 * que falta — uma coisa de cada vez. */
function conferirSenha(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa de pelo menos 10 caracteres.";
  if (!/[a-z]/.test(senha)) return "Falta uma letra minúscula na senha.";
  if (!/[A-Z]/.test(senha)) return "Falta uma letra MAIÚSCULA na senha.";
  if (!/\d/.test(senha)) return "Falta um número na senha.";
  if (!/[^A-Za-z0-9]/.test(senha)) {
    return "Falta um símbolo na senha. Serve qualquer um: ! @ # $ % & * - _";
  }
  return null;
}

/* O Supabase responde em inglês. Estas são as recusas que o cliente consegue
 * provocar sozinho na tela de cadastro; o resto vira uma frase genérica, sem
 * despejar o texto do servidor na cara de quem só queria criar uma conta. */
function traduzirErroDeCadastro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Este e-mail já tem conta. Use “Entrar” ou recupere a senha.";
  }
  if (m.includes("password should contain")) {
    return "A senha precisa ter minúscula, MAIÚSCULA, número e símbolo.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return "A senha precisa de pelo menos 10 caracteres.";
  }
  if (m.includes("invalid email") || m.includes("unable to validate email")) {
    return "E-mail inválido. Confira se não falta algum caractere.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "O cadastro está temporariamente fechado. Fale com a gente pelo WhatsApp.";
  }
  return "Não foi possível criar a conta. Tente de novo em instantes.";
}

export async function signup(_prev: { error?: string }, formData: FormData) {
  const supabase = await createClient();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const telefone = String(formData.get("phone") ?? "");

  const faltaNoTelefone = conferirTelefone(telefone);
  if (faltaNoTelefone) return { error: faltaNoTelefone };

  const faltaNaSenha = conferirSenha(password);
  if (faltaNaSenha) return { error: faltaNaSenha };

  const convite = String(formData.get("convite") ?? "");
  const indicacao = String(formData.get("indicacao") ?? "");
  const plano = String(formData.get("plano") ?? "");
  const planoOk = /^[a-z]{3,20}$/.test(plano) ? plano : "";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone: soNumeros(telefone) } },
  });
  if (error) {
    return { error: traduzirErroDeCadastro(error.message) };
  }
  if (TOKEN.test(convite)) {
    /* com confirmacao de e-mail ligada nao ha sessao ainda: aceita depois */
    if (!data.session) redirect(`/convite/${convite}?aviso=confirme`);
    await seguirConvite(supabase, convite);
  }
  revalidatePath("/", "layout");
  /* o plano escolhido no site segue até a tela de assinatura, para a pessoa
     não ter de escolher duas vezes */
  const extra = [
    TOKEN.test(indicacao) ? `v=${indicacao}` : "",
    planoOk ? `plano=${planoOk}` : "",
  ].filter(Boolean).join("&");
  redirect(extra ? `/onboarding?${extra}` : "/onboarding");
}

export async function requestPasswordReset(
  _prev: { done?: boolean },
  formData: FormData
) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  // Mensagem neutra mesmo se o e-mail não existir (evita enumeração)
  await supabase.auth.resetPasswordForEmail(email);
  return { done: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  /* sem isto o navegador guarda as telas da sessão que acabou */
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function createCompany(
  _prev: { error?: string },
  formData: FormData
) {
  const supabase = await createClient();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const storeName = String(formData.get("store_name") ?? "").trim() || "Loja principal";
  const indicacao = String(formData.get("indicacao") ?? "").trim();
  const plano = String(formData.get("plano") ?? "").trim();

  if (!companyName) return { error: "Informe o nome da empresa." };

  const { error } = await supabase.rpc("create_company", {
    p_company_name: companyName,
    p_store_name: storeName,
    p_referral: TOKEN.test(indicacao) ? indicacao : null,
  });
  if (error) {
    return { error: mensagemDaEmpresa(error.message) };
  }
  revalidatePath("/", "layout");
  /* quem chegou pelo botão de um plano vai direto para a assinatura, com o
     plano dele em destaque; quem chegou sozinho vai para o painel */
  redirect(/^[a-z]{3,20}$/.test(plano) ? `/assinatura?plano=${plano}` : "/dashboard");
}

/* O retorno do banco vinha inteiro para a tela, com nome de função e código
   do Postgres. Quem está criando a empresa não tem o que fazer com isso. */
function mensagemDaEmpresa(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("duplicate") || m.includes("already exists")) {
    return "Você já tem uma empresa criada. Atualize a página.";
  }
  if (m.includes("permission") || m.includes("denied")) {
    return "Sua sessão expirou. Entre de novo e tente outra vez.";
  }
  return "Não foi possível criar a empresa. Tente de novo em instantes.";
}

import { createClient as criar } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço — ignora o RLS por completo.
 *
 * Existe para um caso só: o webhook do Mercado Pago. Um aviso de cobrança
 * chega sem sessão de usuário nenhuma, então não há empresa no contexto para
 * o RLS filtrar. Qualquer outra coisa no sistema usa o cliente normal, com a
 * sessão de quem está logado.
 *
 * A chave nunca pode ter o prefixo NEXT_PUBLIC_: com ela, quem tiver o valor
 * lê e escreve o banco inteiro de todas as lojas.
 */
export function clienteDeServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente."
    );
  }
  return criar(url, chave, { auth: { persistSession: false } });
}

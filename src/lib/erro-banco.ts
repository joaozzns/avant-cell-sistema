/**
 * Mensagem de erro do banco em linguagem de gente.
 *
 * As telas faziam `mensagem.replace(/^.*?: /, "")` para tirar um prefixo
 * técnico — e junto levavam metade da frase. "Cliente bloqueado para novas
 * compras a prazo: cheque devolvido" chegava ao balcão como "cheque
 * devolvido", sem dizer que a venda foi recusada.
 *
 * Aqui só sai o que é ruído de banco de dados mesmo.
 */

const PREFIXOS = [
  /^[A-Z0-9]{5}:\s*/,                       // código SQLSTATE (P0001, 23505…)
  /^(ERROR|FATAL|PANIC):\s*/i,              // nível do Postgres
  /^new row violates row-level security policy for table "[^"]+"$/i,
];

export function mensagemDoBanco(bruto: string | null | undefined): string {
  let texto = (bruto ?? "").trim();
  if (!texto) return "Não deu para completar a operação.";

  for (const p of PREFIXOS.slice(0, 2)) texto = texto.replace(p, "").trim();

  /* erros que só fazem sentido para quem escreveu o sistema */
  if (PREFIXOS[2].test(texto)) {
    return "Você não tem permissão para esta operação.";
  }
  if (/duplicate key value violates unique constraint/i.test(texto)) {
    return "Já existe um registro com esses dados.";
  }
  if (/violates foreign key constraint/i.test(texto)) {
    return "Este registro está ligado a outro e não pode ser alterado assim.";
  }
  if (/null value in column "(\w+)"/i.test(texto)) {
    return "Faltou preencher um campo obrigatório.";
  }
  return texto;
}

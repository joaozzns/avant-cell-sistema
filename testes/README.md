# Testes

    npm test           # contas e formatações — não toca no banco, roda em 1 segundo
    npm run test:regras   # regras de dinheiro, contra um Supabase de verdade

## Por que os testes de regra falam com o banco

As regras que movem dinheiro moram no banco, em funções com `security invoker`:
quem decide se uma devolução pode sair em dinheiro, se a comissão estorna, se o
sinal pode ser retido, é o Postgres — com RLS e permissão do usuário no meio do
caminho. Testar a função com superusuário passaria por cima justamente do que
se quer proteger. Por isso os testes entram com e-mail e senha de um usuário de
verdade e falam pelo PostgREST, igual ao aplicativo.

## Antes de rodar

`npm run test:regras` **escreve no banco apontado por `.env.local`**. Rode contra
um projeto de teste, nunca contra a base de uma loja em operação. Cada teste
cria o que precisa (nomes começando em `ZZTESTE-`) e apaga no fim; o que a
política de segurança não deixa apagar — crédito de loja, por exemplo — fica lá,
então a base de teste acumula sujeira com o tempo.

Credenciais: `AVC_TESTE_EMAIL` e `AVC_TESTE_SENHA` no `.env.local`
(padrão: `teste@avantcell.com.br`).

## O que está coberto

| Arquivo | Regras |
|---|---|
| `unidade.test.ts` | valor digitado em real, data pura sem fuso, "hoje" local, variável de mensagem, telefone de WhatsApp, rótulo de pagamento, prazo de laboratório e de reserva, dígito do IMEI |
| `caixa.test.ts` | esperado do fechamento cego: suprimento, sangria, estorno e recebimento em espécie |
| `devolucao.test.ts` | dinheiro que sai do caixa, devolver mais do que vendeu, crédito da loja virando dinheiro, produto avariado que não volta ao estoque |
| `comissao.test.ts` | reapuração sem duplicar, estorno proporcional de venda devolvida, teto do estorno, estorno preservado na reapuração |
| `operacao.test.ts` | reserva sem cliente, sinal virando crédito e entrando no caixa, aparelho reservado duas vezes, retenção de sinal com motivo, laboratório externo (sem voltar etapa, conta lançada uma vez) e compra de usado com conferência de IMEI |

## O que ainda não está coberto

- transferência entre lojas (precisa de uma segunda loja na base);
- crediário: parcelamento, juros e baixa;
- conciliação de cartão.

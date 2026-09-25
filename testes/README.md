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
cria o que precisa (nomes começando em `ZZTESTE-`) e apaga no fim; o que já
virou documento — venda, movimento de estoque, comissão — o banco não deixa sair
por DELETE, então a base acumula sujeira com o tempo (veja **Limpeza**).

Credenciais: `AVC_TESTE_EMAIL` e `AVC_TESTE_SENHA` no `.env.local`
(padrão: `teste@avantcell.com.br`).

Rode sempre pelo `npm run test:regras`, nunca por `node --test testes/*.test.ts`
direto: os arquivos dividem o mesmo caixa e a mesma loja, então em paralelo um
teste vê o dinheiro que o outro acabou de mexer e falha sem ter defeito nenhum.
O script já passa `--test-concurrency=1` por isso.

## O que está coberto

| Arquivo | Regras |
|---|---|
| `unidade.test.ts` | valor digitado em real, data pura sem fuso, "hoje" local, variável de mensagem, telefone de WhatsApp, rótulo de pagamento, prazo de laboratório e de reserva, dígito do IMEI |
| `caixa.test.ts` | esperado do fechamento cego (suprimento, sangria, estorno, recebimento em espécie) e o que não pode sair da gaveta: saída maior que o saldo, valor zero ou negativo, movimento em caixa fechado |
| `devolucao.test.ts` | dinheiro que sai do caixa, devolver mais do que vendeu, crédito da loja virando dinheiro, produto avariado que não volta ao estoque |
| `comissao.test.ts` | reapuração sem duplicar, estorno proporcional de venda devolvida, teto do estorno, estorno preservado na reapuração |
| `taxa-cartao.test.ts` | taxa combinada gravada na venda, taxa por faixa de parcelas, conciliação acusando desconto a mais e não acusando falso positivo |
| `crediario.test.ts` | limite aprovado por quem pode, venda acima do limite recusada com o saldo na mensagem, parcela paga devolvendo limite, parcela vencida e cliente bloqueado travando a venda; baixa de parcela com juros ou desconto negativo, recebimento acima do saldo, e a baixa honesta entrando no caixa |
| `representantes.test.ts` | representantes do Avant Cell: carteira só com loja pagando, comissão que não aparece antes de o modelo existir, percentual e valor fixo, lojista sem acesso ao negócio do dono, troca de link |
| `vendedor.test.ts` | painel pelo link: link inválido não abre nada, vendas do mês, colega aparece só com o primeiro nome, vendedor comum não vê o número da loja, principal vê a loja e sai da comissão, trocar o link derruba o anterior |
| `ajustes.test.ts` | ajuste de estoque (permissão, motivo escrito, saldo suficiente, documento com valor) e fechamento de caixa (valor contado negativo, contagem obrigatória) |
| `alertas.test.ts` | central de alertas: cria, não duplica, resolve sozinha quando o problema acaba, respeita o adiamento |
| `venda.test.ts` | os números da venda: quantidade negativa ou zero, preço negativo, pagamento negativo inflando a gaveta, troco fora do dinheiro, troco maior que o recebido, desconto negativo, e a venda honesta com troco entrando certo no caixa |
| `compras.test.ts` | recebimento de pedido: entrada no estoque e conta a pagar, recusa de quantidade acima do pedido, quantidade negativa, frete negativo, recebimento vazio e pedido já fechado |
| `inventario.test.ts` | inventário: foto do saldo, contagem negativa, item de outro inventário, recontagem que não reescreve a primeira, fechamento ajustando o saldo com documento |
| `operacao.test.ts` | reserva sem cliente, sinal virando crédito e entrando no caixa, aparelho reservado duas vezes, retenção de sinal com motivo, laboratório externo (sem voltar etapa, conta lançada uma vez), compra de usado com conferência de IMEI e peça da OS (não sai da prateleira o que não está lá; peça aplicada só volta por ajuste) |

## Limpeza

Os testes apagam o que criam, mas o que já virou documento (venda, movimento
de estoque, comissão) o banco não deixa sair por DELETE — e esse volume se
acumula no painel do dia e no faturamento. De tempos em tempos, rode
`supabase/scripts/limpeza_testes_automatizados.sql` no SQL Editor: ele tira
toda a camada ZZTESTE na ordem que o banco aceita.

## O que ainda não está coberto

- **limites por perfil** (desconto em %, sangria em R$, alçada de pagamento):
  as funções passaram a conferir `app.permission_limit`, mas a suíte roda com
  um usuário administrador, e administrador passa por cima de toda permissão.
  Provar o limite exige um segundo usuário com perfil restrito — hoje não dá,
  porque só temos a chave pública no `.env.local`; daria pelo fluxo de convite;
- transferência entre lojas (precisa de uma segunda loja na base);
- crediário: renegociação;

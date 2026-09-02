# AVANT CELL

Sistema de gestão para **loja e assistência técnica de celulares** — venda no
balcão, estoque com IMEI, ordens de serviço, financeiro, fiscal, relatórios e
portal do cliente. Baseado no documento de escopo *"Sistema Loja + Assistência
de Celulares — Plano Completo"* (12 módulos · 82 telas).

## Stack

- **Front:** Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui
- **Banco:** PostgreSQL (Supabase) com Row Level Security por loja
- **Auth:** Supabase Auth (perfis e papéis por unidade)
- **Arquivos:** Supabase Storage (`os-media`, `products`, `documents`, `fiscal`, `branding`)
- **Projeto Supabase:** `jeqngqcpoeaezfpazbzk` (região sa-east-1)

## Rodando

```bash
npm install
npm run dev        # http://localhost:3000
```

As credenciais já estão em `.env.local`. Fluxo inicial: **/cadastro** → cria a
conta → **/onboarding** → cria empresa + primeira loja (vira Proprietário) →
**/dashboard**.

## Banco de dados

Migrations em `supabase/migrations/` (já aplicadas no projeto remoto):

| Arquivo | Conteúdo |
|---|---|
| `..._core.sql` | Empresas, lojas, perfis, papéis × permissões, auditoria, contadores por loja |
| `..._catalog_stock.sql` | Produtos, variações, IMEI unitário (Luhn), peças, entradas, transferências, inventário |
| `..._sales.sql` | Caixa, vendas, pagamento misto, orçamentos, devoluções, crediário, reservas, trade-in |
| `..._service_orders.sql` | OS com máquina de estados, laudo, orçamento versionado, peças, bancada, garantia |
| `..._customers_crm.sql` | Clientes, aparelhos, mensagens WhatsApp, campanhas, NPS, LGPD |
| `..._purchases_finance.sql` | Fornecedores, pedidos de compra, contas, extrato, conciliação, comissões |
| `..._fiscal_admin.sql` | Documentos fiscais, integrações, alertas, configurações, termos versionados |
| `..._rls.sql` | RLS em 84 tabelas + auditoria automática |
| `..._seed.sql` | 53 permissões, 7 papéis do sistema, `app.create_company()` |

Decisões de base (do documento de escopo):

- **Multi-tenant por loja desde o dia 1** — `store_id` em tudo, RLS dupla
  (empresa + loja); estoque é consultável entre lojas, operação não.
- **IMEI é único no sistema inteiro**, com dígito verificador validado no banco.
- **Numeração sequencial por loja** via `app.next_store_number(store, kind)` —
  nunca reaproveitada.
- **Transições de status de OS validadas por trigger** (não vai de Aberta
  direto para Pronta).
- **Log de auditoria append-only** com antes/depois, disparado por trigger nas
  tabelas sensíveis.
- Alteração de preço gera histórico automático (`price_history`).

Para regenerar os tipos TypeScript:

```bash
npx supabase gen types typescript --project-id jeqngqcpoeaezfpazbzk > src/lib/database.types.ts
```

## Roadmap de fases

- [x] **Fase 0** — fundação: schema completo, RLS, auth, papéis, auditoria, shell do app
- [x] **Fase 1** — Módulos 1, 3 e 4: cadastros, estoque com IMEI, PDV e caixa
- [x] **Fase 2** — Módulo 5: OS ponta a ponta + consulta pública por link
- [x] **Fase 3** — Módulos 6, 7 e 8: CRM, compras, financeiro
- [ ] **Fase 4** — Módulos 9, 10 e 12: fiscal, relatórios/BI, portal e PWA do técnico

-- O usuário edita o próprio nome, não os próprios poderes.
--
-- A política de RLS "profiles_update_self" permite a cada pessoa atualizar a
-- própria linha — e RLS enxerga linha, não coluna. Com isso, qualquer usuário
-- podia mandar um PATCH em profiles e:
--
--   · virar equipe Avant Cell (is_staff = true) e passar a ver quanto cada
--     loja paga, quem vendeu e a comissão a pagar;
--   · trocar o próprio company_id e cair dentro da base de outra empresa;
--   · se marcar como vendedor principal ou trocar o próprio token de painel;
--   · reativar a própria conta depois de ser desligado da equipe.
--
-- A ferramenta certa aqui é privilégio por coluna: o usuário só pode escrever
-- no que é dele mesmo (nome, telefone, PIN do PDV). Empresa, situação e
-- poderes continuam mudando, mas só pelas funções do sistema, que rodam como
-- dono do banco e por isso não esbarram nesta restrição.

revoke update on public.profiles from authenticated;

grant update (full_name, phone, pin_hash, must_change_password)
  on public.profiles to authenticated;

-- serviço interno (funções, jobs) continua com acesso completo
grant update on public.profiles to service_role;

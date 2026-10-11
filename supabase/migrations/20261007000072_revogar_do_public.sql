-- A migração 071 revogou de quem nunca teve: era do PUBLIC
--
-- Escrevi `revoke execute ... from anon` e conferi depois: anon continuava
-- executando as oito. O motivo está na ACL da função:
--
--   deliver_os -> =X/postgres | postgres=X/postgres | authenticated=X/postgres
--                 ^^^^^^^^^^^
--
-- Esse primeiro item, com o lado esquerdo vazio, é o PUBLIC. O Postgres dá
-- EXECUTE para PUBLIC em toda função nova, e anon não tem concessão própria:
-- ele executa porque é parte do PUBLIC. Revogar de anon não tira nada, porque
-- não havia nada em nome dele para tirar -- e o comando não reclama.
--
-- É o mesmo erro da migração 067, espelhado. Lá eu revoguei de `public,
-- authenticated` e esqueci anon; aqui revoguei de anon e esqueci o PUBLIC. A
-- lição das duas: conferir a ACL depois, nunca o texto do comando.
--
-- next_store_number já ficou certa na 071, porque ali o comando dizia
-- `from anon, public`.

revoke execute on function public.cash_expected(uuid)                                      from public;
revoke execute on function public.deliver_os(jsonb)                                        from public;
revoke execute on function public.os_apply_part(uuid)                                      from public;
revoke execute on function public.os_request_part(uuid, uuid, numeric, numeric)            from public;
revoke execute on function public.os_return_part(uuid)                                     from public;
revoke execute on function public.po_receive(jsonb)                                        from public;
revoke execute on function public.settle_payable(uuid, numeric, uuid)                      from public;
revoke execute on function public.settle_receivable(uuid, numeric, numeric, numeric, uuid) from public;

-- authenticated e service_role já têm concessão própria (aparecem na ACL com
-- nome), então continuam executando. Quem perde o acesso é só o anon.
grant execute on function public.cash_expected(uuid)                                      to authenticated;
grant execute on function public.deliver_os(jsonb)                                        to authenticated;
grant execute on function public.os_apply_part(uuid)                                      to authenticated;
grant execute on function public.os_request_part(uuid, uuid, numeric, numeric)            to authenticated;
grant execute on function public.os_return_part(uuid)                                     to authenticated;
grant execute on function public.po_receive(jsonb)                                        to authenticated;
grant execute on function public.settle_payable(uuid, numeric, uuid)                      to authenticated;
grant execute on function public.settle_receivable(uuid, numeric, numeric, numeric, uuid) to authenticated;

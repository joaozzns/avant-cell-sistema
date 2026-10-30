-- Período de teste de 14 para 7 dias. Vale para empresas novas: quem já está
-- em teste mantém a data que recebeu ao se cadastrar.
update public.saas_settings set trial_days = 7, updated_at = now() where id;

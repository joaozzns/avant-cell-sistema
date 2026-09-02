-- Fixa search_path das funções restantes (advisor 0011)
alter function app.set_updated_at() set search_path = '';
alter function app.imei_is_valid(text) set search_path = '';
alter function app.os_transition_valid(public.os_status, public.os_status) set search_path = '';
alter function app.enforce_os_transition() set search_path = '';

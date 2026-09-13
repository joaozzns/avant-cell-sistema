-- ============================================================
-- AVANT CELL · Validação de IMEI em todos os campos de IMEI
-- O IMEI 1 do estoque já era travado por chk_imei1_luhn. Agora o IMEI 2
-- do estoque e o IMEI dos aparelhos de clientes (OS) seguem a mesma
-- regra: 15 dígitos com dígito verificador (app.imei_is_valid).
-- ============================================================

-- 1) Dados já gravados que não passariam na regra não são apagados:
--    o valor vai para um campo onde continua visível, e só então a trava entra.

-- IMEI 2 inválido no estoque -> registrado nas observações da unidade
update public.serialized_units
   set notes = concat_ws(E'\n', nullif(notes, ''), 'IMEI 2 inválido retirado na validação: ' || imei2),
       imei2 = null
 where imei2 is not null
   and not app.imei_is_valid(imei2);

-- Aparelho de cliente: até aqui o campo IMEI da OS recebia também número de
-- série. O que não é IMEI válido vai para serial_number (ou para as
-- observações, se o aparelho já tiver série).
update public.customer_devices
   set serial_number = coalesce(serial_number, imei),
       notes = case
                 when serial_number is not null
                 then concat_ws(E'\n', nullif(notes, ''), 'Valor inválido no campo IMEI: ' || imei)
                 else notes
               end,
       imei = null
 where imei is not null
   and not app.imei_is_valid(imei);

-- 2) As travas
alter table public.serialized_units
  add constraint chk_imei2_luhn
  check (imei2 is null or app.imei_is_valid(imei2));

alter table public.customer_devices
  add constraint chk_customer_device_imei_luhn
  check (imei is null or app.imei_is_valid(imei));

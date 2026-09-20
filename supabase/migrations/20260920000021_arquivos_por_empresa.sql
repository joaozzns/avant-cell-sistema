-- Arquivos (fotos de OS, documentos de trade-in, XML fiscal) isolados por empresa.
--
-- As regras anteriores liberavam qualquer usuário autenticado a ler e gravar
-- em qualquer arquivo dos buckets — inclusive de outra empresa. Como o bucket
-- "documents" guarda foto de documento de cliente, isso era um vazamento.
-- Agora o primeiro nível da pasta precisa ser o id da empresa do usuário:
--   <company_id>/os/<os_id>/<arquivo>
--   <company_id>/trade-in/<id>/<arquivo>

drop policy if exists "avantcell authenticated read"   on storage.objects;
drop policy if exists "avantcell authenticated write"  on storage.objects;
drop policy if exists "avantcell authenticated update" on storage.objects;

create policy avc_arquivos_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('os-media', 'products', 'documents', 'fiscal', 'branding')
    and (storage.foldername(name))[1] = app.current_company_id()::text
  );

create policy avc_arquivos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('os-media', 'products', 'documents', 'fiscal', 'branding')
    and (storage.foldername(name))[1] = app.current_company_id()::text
  );

create policy avc_arquivos_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('os-media', 'products', 'branding')
    and (storage.foldername(name))[1] = app.current_company_id()::text
  )
  with check (
    bucket_id in ('os-media', 'products', 'branding')
    and (storage.foldername(name))[1] = app.current_company_id()::text
  );

create policy avc_arquivos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('os-media', 'products', 'branding')
    and (storage.foldername(name))[1] = app.current_company_id()::text
  );

-- limite de tamanho e tipos aceitos por bucket
update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','video/mp4','application/pdf']
 where id in ('os-media', 'documents');

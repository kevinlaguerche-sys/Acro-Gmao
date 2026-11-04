alter table public.acro_login_audit
  add column if not exists app_version text,
  add column if not exists app_build text;

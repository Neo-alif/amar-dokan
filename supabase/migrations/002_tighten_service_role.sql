-- 002_tighten_service_role.sql
-- After 001, service_role also had REFERENCES, TRIGGER and TRUNCATE on every table/view
-- (from Supabase's default privileges). The app only needs SELECT/INSERT/UPDATE/DELETE,
-- so remove the rest. Least privilege: a leaked server key cannot TRUNCATE the ledger.
-- 001 is not edited because it has already been applied; this file records the change.

begin;

-- Existing tables and views (ALL TABLES includes views).
revoke references, trigger, truncate on all tables in schema public from service_role;

-- Future tables created by this role (postgres, the SQL Editor user) in later migrations.
-- Later migrations still grant SELECT/INSERT/UPDATE/DELETE explicitly (auto API grants are OFF).
alter default privileges in schema public revoke references, trigger, truncate on tables from service_role;

commit;

-- 001_init.sql — Amar Dokan database (docs/Schema.md v0.2, with the review fixes noted inline)
-- Run ONCE in the Supabase SQL Editor. Everything is inside one transaction:
-- if any statement fails, nothing is created and you can fix and re-run.
--
-- Access model: the browser never talks to the DB. Only our server, using the
-- service_role key, may read/write. "Grant API access to new tables automatically"
-- is OFF in this project, so every privilege below is granted explicitly.

begin;

-- Supabase keeps extensions in the "extensions" schema.
create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────────── Tables ─────────────────────────────

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  created_at timestamptz default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name_bn text not null,
  name_en text,
  aliases text[] default '{}',
  unit text not null default 'pcs',
  cost_price numeric(10,2) not null default 0 check (cost_price >= 0),
  sell_price numeric(10,2) not null default 0 check (sell_price >= 0),
  stock_qty numeric(10,2) not null default 0,       -- negative allowed, UI warns
  reorder_level numeric(10,2) not null default 5,
  created_at timestamptz default now()
);
create index products_name_trgm on public.products using gin (name_bn extensions.gin_trgm_ops);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  due_balance numeric(10,2) not null default 0 check (due_balance >= 0),
  created_at timestamptz default now()
);

create type public.txn_type as enum ('sale','purchase','expense','payment');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  idempotency_key uuid not null unique,              -- double-tap protection
  type public.txn_type not null,
  customer_id uuid references public.customers(id),
  total numeric(10,2) not null check (total >= 0),
  paid  numeric(10,2) not null check (paid  >= 0),
  due   numeric(10,2) not null check (due   >= 0),
  expense_category text,
  note text,
  raw_text text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now(),
  check (type = 'payment' or paid + due = total)
);
create index on public.transactions (shop_id, occurred_at);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id),
  transaction_id uuid references public.transactions(id) on delete cascade,
  change numeric(10,2) not null,                    -- sale = minus, purchase = plus
  reason text not null,                             -- 'sale','purchase','adjust'
  occurred_at timestamptz not null default now()
);
create index on public.stock_movements (product_id, occurred_at);

create table public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  transaction_id uuid references public.transactions(id) on delete cascade,
  change numeric(10,2) not null,                    -- baki = plus, joma = minus
  occurred_at timestamptz not null default now()
);

create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  input_text text not null,
  lang text not null default 'bn',
  provider text,                                    -- 'gemini' | 'groq'
  model text,
  extracted jsonb,
  final jsonb,
  status text not null default 'extracted',         -- extracted/confirmed/edited/rejected/failed
  latency_ms int,
  transaction_id uuid references public.transactions(id),
  created_at timestamptz default now()
);

-- ─────────────────────── Row Level Security ───────────────────────
-- RLS on, NO policies: anon/authenticated can see nothing even if they had a grant.
-- (Project "auto RLS" is ON too; repeating it here documents the intent and is harmless.)
alter table public.shops             enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.transactions      enable row level security;
alter table public.transaction_items enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.customer_ledger   enable row level security;
alter table public.ai_logs           enable row level security;

-- ─────────────────── apply_transaction (the only money path) ───────────────────
-- Recomputes every number itself; client/LLM totals are ignored. Any failed check
-- raises an error code and rolls back the whole transaction.
create or replace function public.apply_transaction(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t_id     uuid;
  v_key    uuid := (p->>'idempotency_key')::uuid;
  v_shop   uuid := (p->>'shop_id')::uuid;
  v_type   txn_type := (p->>'type')::txn_type;
  v_cust   uuid := nullif(p->>'customer_id','')::uuid;
  v_paid   numeric := round(coalesce((p->>'paid')::numeric, 0), 2);
  -- Review fix: optional timestamp so the seed can create history through this same function.
  -- The API route must NOT pass it from the browser (server sets it, or it defaults to now()).
  v_at     timestamptz := coalesce((p->>'occurred_at')::timestamptz, now());
  v_total  numeric := 0;
  v_due    numeric;
  v_bal    numeric;
  item     jsonb;
  v_qty    numeric;
  v_price  numeric;
  v_sign   int;
begin
  -- idempotency: same key again → return the earlier id, write nothing
  select id into t_id from transactions where idempotency_key = v_key;
  if t_id is not null then return t_id; end if;

  -- Review fix: a given customer must belong to this shop (checked once, for every type)
  if v_cust is not null and not exists
     (select 1 from customers where id = v_cust and shop_id = v_shop) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  -- total = Σ qty × unit_price (backend recompute, client total ignored)
  if v_type in ('sale','purchase') then
    if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then
      raise exception 'ITEMS_REQUIRED';
    end if;
    -- sum of per-line rounded totals, so it always equals Σ transaction_items.line_total
    select coalesce(sum(round((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2)), 0)
      into v_total
      from jsonb_array_elements(p->'items') i;
  elsif v_type = 'expense' then
    v_total := round(coalesce((p->>'total')::numeric, 0), 2);
    if v_total <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    v_paid := v_total;
  elsif v_type = 'payment' then
    if v_cust is null then raise exception 'CUSTOMER_REQUIRED'; end if;
    if v_paid <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    select due_balance into v_bal from customers where id = v_cust and shop_id = v_shop for update;
    if v_paid > v_bal then raise exception 'PAYMENT_EXCEEDS_DUE'; end if;
    v_total := v_paid;
  end if;

  if v_type = 'payment' then
    v_due := 0;
  else
    if v_paid > v_total then raise exception 'PAID_EXCEEDS_TOTAL'; end if;
    v_due := v_total - v_paid;
  end if;

  if v_due > 0 and v_type <> 'sale' then raise exception 'DUE_ONLY_ON_SALE'; end if;
  if v_due > 0 and v_cust is null then raise exception 'CUSTOMER_REQUIRED_FOR_DUE'; end if;

  -- Review fix: two simultaneous requests with the same key → the loser returns the winner's id
  -- instead of failing on the unique constraint.
  insert into transactions (shop_id, idempotency_key, type, customer_id, total, paid, due,
                            expense_category, note, raw_text, occurred_at)
  values (v_shop, v_key, v_type, v_cust, v_total, v_paid, v_due,
          p->>'expense_category', p->>'note', p->>'raw_text', v_at)
  on conflict (idempotency_key) do nothing
  returning id into t_id;
  if t_id is null then
    select id into t_id from transactions where idempotency_key = v_key;
    return t_id;
  end if;

  -- Review fix: items are only read for sale/purchase (expense/payment items are ignored,
  -- so no item rows can disagree with the total).
  if v_type in ('sale','purchase') then
    v_sign := case v_type when 'sale' then -1 else 1 end;
    for item in select * from jsonb_array_elements(p->'items') loop
      v_qty   := (item->>'quantity')::numeric;
      v_price := (item->>'unit_price')::numeric;
      insert into transaction_items (transaction_id, product_id, quantity, unit_price, line_total)
      values (t_id, (item->>'product_id')::uuid, v_qty, v_price, round(v_qty * v_price, 2));

      insert into stock_movements (shop_id, product_id, transaction_id, change, reason, occurred_at)
      values (v_shop, (item->>'product_id')::uuid, t_id, v_sign * v_qty, v_type::text, v_at);
      update products set stock_qty = stock_qty + v_sign * v_qty
       where id = (item->>'product_id')::uuid and shop_id = v_shop;
      if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    end loop;
  end if;

  if v_type = 'sale' and v_due > 0 then
    insert into customer_ledger (shop_id, customer_id, transaction_id, change, occurred_at)
    values (v_shop, v_cust, t_id, v_due, v_at);
    update customers set due_balance = due_balance + v_due where id = v_cust and shop_id = v_shop;
  elsif v_type = 'payment' then
    insert into customer_ledger (shop_id, customer_id, transaction_id, change, occurred_at)
    values (v_shop, v_cust, t_id, -v_paid, v_at);
    update customers set due_balance = due_balance - v_paid where id = v_cust and shop_id = v_shop;
  end if;

  return t_id;
end $$;

-- ─────────────────────── Helper views (Asia/Dhaka) ───────────────────────
-- security_invoker: the view runs with the caller's rights, so RLS still applies.
-- Review fix: shop_id added so the view stays correct if a second shop ever exists.
create view public.daily_product_sales
with (security_invoker = true) as
select shop_id,
       product_id,
       (occurred_at at time zone 'Asia/Dhaka')::date as day,
       sum(-change) as qty_sold
from public.stock_movements
where reason = 'sale'
group by shop_id, product_id, day;

create view public.today_summary
with (security_invoker = true) as
select shop_id,
  coalesce(sum(total) filter (where type = 'sale'), 0)                  as sales,
  coalesce(sum(total) filter (where type in ('purchase','expense')), 0) as spend,
  coalesce(sum(paid)  filter (where type = 'payment'), 0)               as collected,
  count(*) as txn_count
from public.transactions
where (occurred_at at time zone 'Asia/Dhaka')::date
    = (now() at time zone 'Asia/Dhaka')::date
group by shop_id;

-- ─────────────────────────── Privileges ───────────────────────────
-- 1. Nobody but service_role: strip anything anon/authenticated might have.
revoke all on all tables in schema public from anon, authenticated;   -- includes the views
revoke all on function public.apply_transaction(jsonb) from public, anon, authenticated;

-- 2. service_role (our server) gets exactly what the app needs. It bypasses RLS,
--    but still needs these GRANTs because automatic API grants are OFF.
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.shops, public.products, public.customers, public.transactions,
  public.transaction_items, public.stock_movements, public.customer_ledger, public.ai_logs
  to service_role;
grant select on public.daily_product_sales, public.today_summary to service_role;
grant execute on function public.apply_transaction(jsonb) to service_role;

commit;

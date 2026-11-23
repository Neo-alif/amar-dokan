-- 003_money_position.sql — টাকার অবস্থা (money position) + দেনা (supplier credit)
-- Run in the Supabase SQL Editor after 001 and 002. One transaction: all or nothing.
--
-- 1. Every transaction gets a payment method: cash (default), bkash or bank.
-- 2. money_counts: the owner's "মিলিয়ে নিন" counts (cash / bank / bkash), with time and history.
--    Balance of an account = last count + money in − money out by that method since the count.
-- 3. suppliers + supplier_ledger: purchase on credit (দেনা) and paying a supplier back.
--    A supplier payment is a 'payment' row with supplier_id (customer payment = customer_id).
-- 4. apply_transaction is replaced: same signature, new fields method + supplier_id.

begin;

-- ───────────────────────── 1. payment method ─────────────────────────
alter table public.transactions
  add column method text not null default 'cash' check (method in ('cash', 'bkash', 'bank'));

-- ───────────────────────── 3. suppliers (দেনা) ─────────────────────────
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  due_balance numeric(10,2) not null default 0 check (due_balance >= 0), -- what the shop still owes
  created_at timestamptz default now()
);
create index suppliers_shop on public.suppliers (shop_id);

create table public.supplier_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  transaction_id uuid references public.transactions(id) on delete cascade,
  change numeric(10,2) not null,                    -- bought on credit = plus, paid back = minus
  occurred_at timestamptz not null default now()
);
create index supplier_ledger_supplier on public.supplier_ledger (supplier_id, occurred_at);

alter table public.transactions
  add column supplier_id uuid references public.suppliers(id),
  add constraint transactions_one_party check (customer_id is null or supplier_id is null);

-- ───────────────────────── 2. money counts ─────────────────────────
create table public.money_counts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  account text not null check (account in ('cash', 'bkash', 'bank')),
  counted numeric(12,2) not null check (counted >= 0),   -- what the owner counted / read
  expected numeric(12,2) not null,                       -- what the app had at that moment
  note text,                                             -- optional reason for a difference
  counted_at timestamptz not null default now()
);
create index money_counts_shop on public.money_counts (shop_id, account, counted_at desc);

alter table public.suppliers       enable row level security;
alter table public.supplier_ledger enable row level security;
alter table public.money_counts    enable row level security;

-- Signed money movement of every transaction, on the account its method names.
-- sale: +paid (cash received now) · customer payment: +paid · supplier payment: −paid
-- purchase: −paid (the credit part goes to দেনা) · expense: −paid (= total)
create view public.money_flows
with (security_invoker = true) as
select shop_id, method as account, occurred_at,
  case
    when type = 'sale' then paid
    when type = 'payment' and supplier_id is null then paid
    else -paid
  end as amount
from public.transactions
where paid > 0;

-- today's spend stays purchase + expense; collected = customer payments only
create or replace view public.today_summary
with (security_invoker = true) as
select shop_id,
  coalesce(sum(total) filter (where type = 'sale'), 0)                  as sales,
  coalesce(sum(total) filter (where type in ('purchase','expense')), 0) as spend,
  coalesce(sum(paid)  filter (where type = 'payment' and supplier_id is null), 0) as collected,
  count(*) as txn_count
from public.transactions
where (occurred_at at time zone 'Asia/Dhaka')::date
    = (now() at time zone 'Asia/Dhaka')::date
group by shop_id;

-- One row per account: last count (null if never counted), money in/out since then, balance now.
-- Never counted → balance = all flows since the shop started (opening balance 0).
create or replace function public.money_position(p_shop uuid)
returns table (account text, counted numeric, counted_at timestamptz, money_in numeric, money_out numeric, balance numeric)
language sql
stable
set search_path = public
as $$
  with accounts(account) as (values ('cash'), ('bank'), ('bkash')),
  last_count as (
    select distinct on (account) account, counted, counted_at
    from money_counts where shop_id = p_shop
    order by account, counted_at desc
  )
  select a.account, l.counted, l.counted_at,
         coalesce(sum(f.amount) filter (where f.amount > 0), 0)  as money_in,
         coalesce(-sum(f.amount) filter (where f.amount < 0), 0) as money_out,
         coalesce(l.counted, 0) + coalesce(sum(f.amount), 0)     as balance
  from accounts a
  left join last_count l on l.account = a.account
  left join money_flows f on f.shop_id = p_shop and f.account = a.account
                         and (l.counted_at is null or f.occurred_at > l.counted_at)
  group by a.account, l.counted, l.counted_at
  order by a.account;
$$;

-- "মিলিয়ে নিন": store what the owner counted next to what the app expected. Returns the difference.
create or replace function public.count_money(p_shop uuid, p_account text, p_counted numeric, p_note text)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_expected numeric;
  v_counted  numeric := round(p_counted, 2);
begin
  if p_account is null or p_account not in ('cash', 'bkash', 'bank') then raise exception 'BAD_ACCOUNT'; end if;
  if v_counted is null or v_counted < 0 then raise exception 'AMOUNT_REQUIRED'; end if;
  select balance into v_expected from money_position(p_shop) where account = p_account;
  insert into money_counts (shop_id, account, counted, expected, note)
  values (p_shop, p_account, v_counted, v_expected, nullif(btrim(p_note), ''));
  return v_counted - v_expected;
end $$;

-- ─────────────── 4. apply_transaction (the only money path), now with method + supplier ───────────────
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
  v_supp   uuid := nullif(p->>'supplier_id','')::uuid;
  v_method text := coalesce(nullif(p->>'method',''), 'cash');
  v_paid   numeric := round(coalesce((p->>'paid')::numeric, 0), 2);
  -- optional timestamp so the seed can create history through this same function;
  -- the API route never passes it (the DB stamps now()).
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

  if v_method not in ('cash', 'bkash', 'bank') then raise exception 'BAD_METHOD'; end if;
  if v_cust is not null and v_supp is not null then raise exception 'ONE_PARTY_ONLY'; end if;

  -- a given customer / supplier must belong to this shop
  if v_cust is not null and not exists
     (select 1 from customers where id = v_cust and shop_id = v_shop) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if v_supp is not null and not exists
     (select 1 from suppliers where id = v_supp and shop_id = v_shop) then
    raise exception 'SUPPLIER_NOT_FOUND';
  end if;
  if v_supp is not null and v_type not in ('purchase', 'payment') then raise exception 'SUPPLIER_ONLY_ON_PURCHASE'; end if;

  -- total = Σ qty × unit_price (backend recompute, client total ignored)
  if v_type in ('sale','purchase') then
    if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then
      raise exception 'ITEMS_REQUIRED';
    end if;
    select coalesce(sum(round((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2)), 0)
      into v_total
      from jsonb_array_elements(p->'items') i;
  elsif v_type = 'expense' then
    v_total := round(coalesce((p->>'total')::numeric, 0), 2);
    if v_total <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    v_paid := v_total;
  elsif v_type = 'payment' then
    if v_cust is null and v_supp is null then raise exception 'CUSTOMER_REQUIRED'; end if;
    if v_paid <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    if v_supp is not null then
      select due_balance into v_bal from suppliers where id = v_supp and shop_id = v_shop for update;
    else
      select due_balance into v_bal from customers where id = v_cust and shop_id = v_shop for update;
    end if;
    if v_paid > v_bal then raise exception 'PAYMENT_EXCEEDS_DUE'; end if;
    v_total := v_paid;
  end if;

  if v_type = 'payment' then
    v_due := 0;
  else
    if v_paid > v_total then raise exception 'PAID_EXCEEDS_TOTAL'; end if;
    v_due := v_total - v_paid;
  end if;

  if v_due > 0 and v_type not in ('sale', 'purchase') then raise exception 'DUE_ONLY_ON_SALE'; end if;
  if v_due > 0 and v_type = 'sale' and v_cust is null then raise exception 'CUSTOMER_REQUIRED_FOR_DUE'; end if;
  if v_due > 0 and v_type = 'purchase' and v_supp is null then raise exception 'SUPPLIER_REQUIRED_FOR_DUE'; end if;

  -- two simultaneous requests with the same key → the loser returns the winner's id
  insert into transactions (shop_id, idempotency_key, type, customer_id, supplier_id, method, total, paid, due,
                            expense_category, note, raw_text, occurred_at)
  values (v_shop, v_key, v_type, v_cust, v_supp, v_method, v_total, v_paid, v_due,
          p->>'expense_category', p->>'note', p->>'raw_text', v_at)
  on conflict (idempotency_key) do nothing
  returning id into t_id;
  if t_id is null then
    select id into t_id from transactions where idempotency_key = v_key;
    return t_id;
  end if;

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
  elsif v_type = 'purchase' and v_due > 0 then
    insert into supplier_ledger (shop_id, supplier_id, transaction_id, change, occurred_at)
    values (v_shop, v_supp, t_id, v_due, v_at);
    update suppliers set due_balance = due_balance + v_due where id = v_supp and shop_id = v_shop;
  elsif v_type = 'payment' and v_supp is not null then
    insert into supplier_ledger (shop_id, supplier_id, transaction_id, change, occurred_at)
    values (v_shop, v_supp, t_id, -v_paid, v_at);
    update suppliers set due_balance = due_balance - v_paid where id = v_supp and shop_id = v_shop;
  elsif v_type = 'payment' then
    insert into customer_ledger (shop_id, customer_id, transaction_id, change, occurred_at)
    values (v_shop, v_cust, t_id, -v_paid, v_at);
    update customers set due_balance = due_balance - v_paid where id = v_cust and shop_id = v_shop;
  end if;

  return t_id;
end $$;

-- ─────────────────────────── Privileges (same rules as 001/002) ───────────────────────────
revoke all on public.suppliers, public.supplier_ledger, public.money_counts, public.money_flows from anon, authenticated;
revoke all on function public.money_position(uuid) from public, anon, authenticated;
revoke all on function public.count_money(uuid, text, numeric, text) from public, anon, authenticated;
revoke all on function public.apply_transaction(jsonb) from public, anon, authenticated;

grant select, insert, update, delete on public.suppliers, public.supplier_ledger, public.money_counts to service_role;
grant select on public.money_flows, public.today_summary to service_role;
grant execute on function public.money_position(uuid) to service_role;
grant execute on function public.count_money(uuid, text, numeric, text) to service_role;
grant execute on function public.apply_transaction(jsonb) to service_role;

commit;

# Schema — Amar Dokan

> v0.2 · Supabase PostgreSQL. File: `supabase/migrations/001_init.sql`
> Principle: **stock ar baki "ledger" theke ashe.** Prottek change ekta row, tai history kokhono hariye jay na, ar forecast er jonno data thake.
> v0.2 changes: RLS + RPC lock, money validation inside the DB, Dhaka timezone, idempotency key, `pending` removed from logs flow, `return` type cut.

---

## 1. Tables at a glance

| Table | Ki rakhe |
|---|---|
| `shops` | Dokan (demo te ekta) |
| `products` | Mal: naam, alias, unit, dam, current stock, reorder level |
| `customers` | Baki-wala customer |
| `transactions` | Prottek confirmed entry (sale/purchase/expense/payment) |
| `transaction_items` | Ekta transaction er item gulo |
| `stock_movements` | Stock er protiti + / − (forecast er data source) |
| `customer_ledger` | Baki + / − (customer due history) |
| `ai_logs` | Raw input, AI output, confirm/edit/reject (accuracy metric) |

```
shops 1──* products
shops 1──* customers
shops 1──* transactions 1──* transaction_items *──1 products
transactions 1──* stock_movements *──1 products
transactions 1──* customer_ledger *──1 customers
ai_logs *──1 transactions (nullable)
```

## 2. Tables (SQL)

```sql
-- 001_init.sql
create extension if not exists pg_trgm;

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
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
create index products_name_trgm on products using gin (name_bn gin_trgm_ops);

create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text,
  due_balance numeric(10,2) not null default 0 check (due_balance >= 0),
  created_at timestamptz default now()
);

create type txn_type as enum ('sale','purchase','expense','payment');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  idempotency_key uuid not null unique,              -- double-tap protection
  type txn_type not null,
  customer_id uuid references customers(id),
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
create index on transactions (shop_id, occurred_at);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id),
  transaction_id uuid references transactions(id) on delete cascade,
  change numeric(10,2) not null,                    -- sale = minus, purchase = plus
  reason text not null,                             -- 'sale','purchase','adjust'
  occurred_at timestamptz not null default now()
);
create index on stock_movements (product_id, occurred_at);

create table customer_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id),
  transaction_id uuid references transactions(id) on delete cascade,
  change numeric(10,2) not null,                    -- baki = plus, joma = minus
  occurred_at timestamptz not null default now()
);

create table ai_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete cascade,
  input_text text not null,
  lang text not null default 'bn',
  provider text,                                    -- 'gemini' | 'groq'
  model text,
  extracted jsonb,
  final jsonb,
  status text not null default 'extracted',         -- extracted/confirmed/edited/rejected/failed
  latency_ms int,
  transaction_id uuid references transactions(id),
  created_at timestamptz default now()
);
```

## 3. Security (Supabase-specific, MUST)

Supabase anon key public thake, ar repo o public. Tai table ar RPC directly kholable rakha jabe na.

```sql
-- RLS on, kono policy na → anon/authenticated kichui read/write korte parbe na.
-- Server (API routes) service_role key use kore, jeta RLS bypass kore.
alter table shops             enable row level security;
alter table products          enable row level security;
alter table customers         enable row level security;
alter table transactions      enable row level security;
alter table transaction_items enable row level security;
alter table stock_movements   enable row level security;
alter table customer_ledger   enable row level security;
alter table ai_logs           enable row level security;
```

Function ar view er permission section 4-5 er shesh e.

## 4. Atomic apply function (with validation)

Confirm er por API ei ekta function call kore. **Shob money check DB er bhetore**, client er number trust kora hoy na. Kono check fail hole puro transaction rollback.

```sql
create or replace function apply_transaction(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t_id     uuid;
  v_shop   uuid := (p->>'shop_id')::uuid;
  v_type   txn_type := (p->>'type')::txn_type;
  v_cust   uuid := nullif(p->>'customer_id','')::uuid;
  v_paid   numeric := coalesce((p->>'paid')::numeric, 0);
  v_total  numeric := 0;
  v_due    numeric;
  v_bal    numeric;
  item     jsonb;
  v_qty    numeric;
  v_price  numeric;
  sign     int;
begin
  -- idempotency: same key abar ashle ager id ferot dey, kichu notun likhe na
  select id into t_id from transactions
   where idempotency_key = (p->>'idempotency_key')::uuid;
  if t_id is not null then return t_id; end if;

  -- total = Σ qty × unit_price (backend recompute, client er total ignore)
  if v_type in ('sale','purchase') then
    if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then
      raise exception 'ITEMS_REQUIRED';
    end if;
    select coalesce(sum((i->>'quantity')::numeric * (i->>'unit_price')::numeric), 0)
      into v_total
      from jsonb_array_elements(p->'items') i;
  elsif v_type = 'expense' then
    v_total := coalesce((p->>'total')::numeric, 0);
    if v_total <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    v_paid := v_total;
  elsif v_type = 'payment' then
    if v_cust is null then raise exception 'CUSTOMER_REQUIRED'; end if;
    if v_paid <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    select due_balance into v_bal from customers where id = v_cust and shop_id = v_shop for update;
    if v_bal is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
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

  insert into transactions (shop_id, idempotency_key, type, customer_id, total, paid, due,
                            expense_category, note, raw_text)
  values (v_shop, (p->>'idempotency_key')::uuid, v_type, v_cust, v_total, v_paid, v_due,
          p->>'expense_category', p->>'note', p->>'raw_text')
  returning id into t_id;

  sign := case v_type when 'sale' then -1 when 'purchase' then 1 else 0 end;

  for item in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    v_qty   := (item->>'quantity')::numeric;
    v_price := (item->>'unit_price')::numeric;
    insert into transaction_items (transaction_id, product_id, quantity, unit_price, line_total)
    values (t_id, (item->>'product_id')::uuid, v_qty, v_price, v_qty * v_price);

    if sign <> 0 then
      insert into stock_movements (shop_id, product_id, transaction_id, change, reason)
      values (v_shop, (item->>'product_id')::uuid, t_id, sign * v_qty, v_type::text);
      update products set stock_qty = stock_qty + sign * v_qty
       where id = (item->>'product_id')::uuid and shop_id = v_shop;
      if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    end if;
  end loop;

  if v_type = 'sale' and v_due > 0 then
    insert into customer_ledger (shop_id, customer_id, transaction_id, change)
    values (v_shop, v_cust, t_id, v_due);
    update customers set due_balance = due_balance + v_due where id = v_cust and shop_id = v_shop;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  elsif v_type = 'payment' then
    insert into customer_ledger (shop_id, customer_id, transaction_id, change)
    values (v_shop, v_cust, t_id, -v_paid);
    update customers set due_balance = due_balance - v_paid where id = v_cust;
  end if;

  return t_id;
end $$;

-- Shudhu server (service_role) call korte parbe
revoke execute on function apply_transaction(jsonb) from public, anon, authenticated;
grant  execute on function apply_transaction(jsonb) to service_role;
```

**Error code → UI message** (API route map kore, `i18n` e):

| Code | Bangla message |
|---|---|
| `CUSTOMER_REQUIRED_FOR_DUE` | বাকি রাখতে কাস্টমারের নাম লাগবে |
| `PAYMENT_EXCEEDS_DUE` | কাস্টমারের বাকির চেয়ে বেশি জমা |
| `PAID_EXCEEDS_TOTAL` | মোটের চেয়ে বেশি টাকা দেওয়া হয়েছে |
| `ITEMS_REQUIRED` / `AMOUNT_REQUIRED` | পণ্য বা টাকার পরিমাণ লাগবে |
| `PRODUCT_NOT_FOUND` / `CUSTOMER_NOT_FOUND` | পণ্য/কাস্টমার পাওয়া যায়নি |

## 5. Helper views (Dhaka timezone)

Supabase server UTC te chole. Tai "aj" ar "din" shob shomoy `Asia/Dhaka` e convert kore.

```sql
create view daily_product_sales
with (security_invoker = true) as
select product_id,
       (occurred_at at time zone 'Asia/Dhaka')::date as day,
       sum(-change) as qty_sold
from stock_movements
where reason = 'sale'
group by product_id, day;

create view today_summary
with (security_invoker = true) as
select shop_id,
  coalesce(sum(total) filter (where type = 'sale'), 0)                  as sales,
  coalesce(sum(total) filter (where type in ('purchase','expense')), 0) as spend,
  coalesce(sum(paid)  filter (where type = 'payment'), 0)               as collected,
  count(*) as txn_count
from transactions
where (occurred_at at time zone 'Asia/Dhaka')::date
    = (now() at time zone 'Asia/Dhaka')::date
group by shop_id;

revoke all on daily_product_sales, today_summary from anon, authenticated;
```

`security_invoker = true` mane view RLS mene chole, tai anon diye view diyeo data ber kora jabe na.

## 6. New product / customer (resolve step)

`apply_transaction` shudhu existing id ney. Tai confirm card e **"নতুন পণ্য/কাস্টমার"** thakle API age insert kore, tarpor apply call kore:

```
/api/transactions:
  1. Zod validate payload (server side, abar)
  2. new_products[] → insert products (name_bn, unit, sell_price = unit_price) → id pao
  3. new_customer  → insert customers → id pao
  4. apply_transaction(payload with ids)
  5. ai_logs update (status, final, transaction_id)
```
Step 2-4 fail hole notun product row thakleo ok (harmless), transaction kokhono half hoy na.

## 7. Keno ei design (judge jiggesh korle)

- **Ledger pattern:** `stock_qty` ar `due_balance` shudhu fast read er cache. Asol shotti `stock_movements` ar `customer_ledger` e.
- **Money logic DB te:** LLM ba client je number i pathak, total ar due DB nije hishab kore, rule venge kichu save hoy na.
- **Idempotency key:** network slow hole ba double-tap korle o ekta transaction e hoy.
- **RLS + revoke:** public anon key diye keu data dekhte ba bodlate parbe na.
- **`ai_logs`:** AI accuracy, edit rate, kon provider use holo, measure kora jay.
- **Dhaka timezone:** raat 12-6 tar moddhe o "aj" er hishab thik.

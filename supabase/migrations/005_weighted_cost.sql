-- 005_weighted_cost.sql — weighted average cost on purchases.
-- Run in the Supabase SQL Editor after 001–004. One transaction: all or nothing.
--
-- apply_transaction is copied unchanged from 003 except the purchase stock update:
--   cost_price = (old_stock × old_cost + qty × unit_cost) / (old_stock + qty), rounded to 2 decimals;
--   old_stock ≤ 0 → cost_price = unit_cost (nothing on the shelf to average with).
-- Sales, idempotency (key check + on conflict), atomicity, search_path and grants are as in 003.
-- Profit already uses products.cost_price (AppFlow: current cost), so it now uses the average.

begin;

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
      if v_type = 'purchase' then
        -- 005: weighted average cost; both sides read the OLD stock_qty/cost_price (one UPDATE)
        update products set
          cost_price = case when stock_qty <= 0 then v_price
                            else round((stock_qty * cost_price + v_qty * v_price) / (stock_qty + v_qty), 2) end,
          stock_qty  = stock_qty + v_qty
         where id = (item->>'product_id')::uuid and shop_id = v_shop;
      else
        update products set stock_qty = stock_qty + v_sign * v_qty
         where id = (item->>'product_id')::uuid and shop_id = v_shop;
      end if;
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


-- ─────────────────────────── Privileges (same as 003) ───────────────────────────
revoke all on function public.apply_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.apply_transaction(jsonb) to service_role;

commit;

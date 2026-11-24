-- 004_stock_count.sql — গুনে দেখা স্টক (stock count): "চাল ৪০ কেজি আছে" sets the stock to exactly 40.
-- Run in the Supabase SQL Editor after 001–003. One transaction: all or nothing.
--
-- Design: a count is NOT money, so it writes no transactions row. It writes one stock_movements row
-- with reason 'adjust' and transaction_id NULL (the column is nullable since 001).
-- Because there is no transactions row to hold the idempotency key, stock_movements gets its own
-- nullable, unique idempotency_key (sale/purchase rows leave it NULL; NULLs never collide).
-- The LLM only says the counted qty; this function computes change = counted − current stock.

begin;

alter table public.stock_movements add column idempotency_key uuid unique;

create or replace function public.apply_stock_count(
  p_shop uuid, p_product uuid, p_counted numeric, p_key uuid, p_at timestamptz default now())
returns numeric                      -- the adjustment written (counted − stock before)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counted numeric := round(p_counted, 2);
  v_stock   numeric;
  v_change  numeric;
  v_id      uuid;
begin
  if p_key is null then raise exception 'KEY_REQUIRED'; end if;

  -- idempotency: same key again → return the earlier adjustment, change nothing
  select change into v_change from stock_movements where idempotency_key = p_key;
  if found then return v_change; end if;

  if v_counted is null or v_counted < 0 then raise exception 'BAD_COUNT'; end if;

  -- lock the product so a sale saved at the same moment can't slip between read and write
  select stock_qty into v_stock from products where id = p_product and shop_id = p_shop for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  v_change := v_counted - v_stock;

  -- a 0 change is still recorded: it proves the owner counted and stock matched
  insert into stock_movements (shop_id, product_id, transaction_id, change, reason, occurred_at, idempotency_key)
  values (p_shop, p_product, null, v_change, 'adjust', coalesce(p_at, now()), p_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then  -- lost a race with the same key → return the winner's change
    select change into v_change from stock_movements where idempotency_key = p_key;
    return v_change;
  end if;

  update products set stock_qty = v_counted where id = p_product and shop_id = p_shop;
  return v_change;
end $$;

revoke all on function public.apply_stock_count(uuid, uuid, numeric, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_stock_count(uuid, uuid, numeric, uuid, timestamptz) to service_role;

commit;

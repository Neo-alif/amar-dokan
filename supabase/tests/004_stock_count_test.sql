-- 004_stock_count_test.sql — tests for 004_stock_count.sql (apply_stock_count)
-- Run in the Supabase SQL Editor AFTER 004. Everything is inside begin … rollback: no row stays.
-- Output: one result grid, one row per check, last column PASS / FAIL.

begin;

create temp table t_results (n text, test text, expected text, actual text, pass boolean);

do $$
declare
  v_shop uuid; v_other uuid; v_prod uuid; v_foreign uuid;
  v_key uuid := gen_random_uuid();
  v_change numeric; v_stock numeric; v_cnt int;
  r record; err text;
begin
  insert into shops (name) values ('TEST count shop') returning id into v_shop;
  insert into shops (name) values ('TEST other shop') returning id into v_other;
  insert into products (shop_id, name_bn, unit, sell_price, stock_qty)
    values (v_shop, 'চাল', 'kg', 70, 50) returning id into v_prod;
  insert into products (shop_id, name_bn, unit, stock_qty)
    values (v_other, 'চিনি', 'kg', 9) returning id into v_foreign;

  -- yesterday's sale of 2 kg first (stock 50 → 48), then this morning's count says 40
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
    'paid', 140, 'occurred_at', now() - interval '1 day',
    'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price', 70))));
  v_change := apply_stock_count(v_shop, v_prod, 40, v_key);
  reset role;

  -- S1: count sets the exact stock; the function returns counted − before
  select stock_qty into v_stock from products where id = v_prod;
  insert into t_results values ('S1', 'count 40 after stock 48',
    'stock 40, change -8', format('stock %s, change %s', v_stock, v_change), v_stock = 40 and v_change = -8);

  -- S2: one adjust movement, no transaction, no money row
  select count(*), min(change), bool_and(transaction_id is null) into v_cnt, v_change, err
    from stock_movements where product_id = v_prod and reason = 'adjust';
  insert into t_results values ('S2', 'adjust movement written',
    '1 row, change -8, transaction_id null', format('%s row, change %s, transaction_id null %s', v_cnt, v_change, err),
    v_cnt = 1 and v_change = -8 and err = 'true');
  select count(*) into v_cnt from transactions where shop_id = v_shop;
  insert into t_results values ('S2b', 'count writes no transaction', '1 (the sale only)', v_cnt::text, v_cnt = 1);

  -- S3: same key again → same answer, no extra row, stock unchanged
  set local role service_role;
  v_change := apply_stock_count(v_shop, v_prod, 40, v_key);
  reset role;
  select count(*) into v_cnt from stock_movements where product_id = v_prod and reason = 'adjust';
  select stock_qty into v_stock from products where id = v_prod;
  insert into t_results values ('S3', 'same key twice',
    '1 adjust row, stock 40, change -8', format('%s adjust row, stock %s, change %s', v_cnt, v_stock, v_change),
    v_cnt = 1 and v_stock = 40 and v_change = -8);

  -- S4: a retry that arrives AFTER a new sale must not reset stock back to the old count
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
    'paid', 70, 'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'unit_price', 70))));
  perform apply_stock_count(v_shop, v_prod, 40, v_key);
  reset role;
  select stock_qty into v_stock from products where id = v_prod;
  insert into t_results values ('S4', 'late retry after a sale', 'stock 39', v_stock::text, v_stock = 39);

  -- S5: count equal to stock → change 0, still recorded
  set local role service_role;
  v_change := apply_stock_count(v_shop, v_prod, 39, gen_random_uuid());
  reset role;
  select count(*) into v_cnt from stock_movements where product_id = v_prod and reason = 'adjust';
  insert into t_results values ('S5', 'count matches stock', 'change 0, 2 adjust rows',
    format('change %s, %s adjust rows', v_change, v_cnt), v_change = 0 and v_cnt = 2);

  -- S6: negative count → rejected
  begin
    set local role service_role;
    perform apply_stock_count(v_shop, v_prod, -1, gen_random_uuid());
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('S6', 'negative count', 'BAD_COUNT', err, err = 'BAD_COUNT');

  -- S7: another shop's product → rejected, its stock untouched
  begin
    set local role service_role;
    perform apply_stock_count(v_shop, v_foreign, 1, gen_random_uuid());
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  select stock_qty into v_stock from products where id = v_foreign;
  insert into t_results values ('S7', 'product from another shop', 'PRODUCT_NOT_FOUND, stock 9',
    format('%s, stock %s', err, v_stock), err = 'PRODUCT_NOT_FOUND' and v_stock = 9);

  -- S8: forecast data ignores adjustments (only the 2 + 1 kg sold)
  select coalesce(sum(qty_sold), 0) into v_stock from daily_product_sales where product_id = v_prod;
  insert into t_results values ('S8', 'daily_product_sales excludes adjust', '3', v_stock::text, v_stock = 3);

  -- S9: anon can't call it
  begin
    set local role anon;
    perform apply_stock_count(v_shop, v_prod, 0, gen_random_uuid());
    err := 'no error';
  exception when others then err := sqlstate;
  end;
  reset role;
  insert into t_results values ('S9', 'anon calls apply_stock_count', '42501', err, err = '42501');
end $$;

select n, test, expected, actual, case when pass then 'PASS' else 'FAIL' end as result
from t_results order by length(n), n;

rollback;

-- 005_weighted_cost_test.sql — tests for 005_weighted_cost.sql (weighted average cost on purchase)
-- Run in the Supabase SQL Editor AFTER 005. Everything is inside begin … rollback: no row stays.
-- Output: one result grid, one row per check, last column PASS / FAIL.

begin;

create temp table t_results (n text, test text, expected text, actual text, pass boolean);

do $$
declare
  v_shop uuid; v_rice uuid; v_new uuid;
  v_key uuid := gen_random_uuid();
  v_cost numeric; v_stock numeric;
begin
  insert into shops (name) values ('TEST cost shop') returning id into v_shop;
  insert into products (shop_id, name_bn, unit, sell_price, cost_price, stock_qty)
    values (v_shop, 'চাল', 'kg', 75, 68, 247) returning id into v_rice;
  insert into products (shop_id, name_bn, unit, sell_price, cost_price, stock_qty)
    values (v_shop, 'মুগ ডাল', 'kg', 150, 0, 0) returning id into v_new;

  -- W1: 247 kg @ ৳68 + 2 kg @ ৳25 → (247×68 + 2×25) / 249 = 67.6546… → 67.65
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', v_key, 'shop_id', v_shop, 'type', 'purchase',
    'paid', 50, 'items', jsonb_build_array(jsonb_build_object('product_id', v_rice, 'quantity', 2, 'unit_price', 25))));
  reset role;
  select cost_price, stock_qty into v_cost, v_stock from products where id = v_rice;
  insert into t_results values ('W1', '247 kg @68 + 2 kg @25',
    'cost 67.65, stock 249', format('cost %s, stock %s', v_cost, v_stock), v_cost = 67.65 and v_stock = 249);

  -- W2: same idempotency key again → nothing written, cost not averaged twice
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', v_key, 'shop_id', v_shop, 'type', 'purchase',
    'paid', 50, 'items', jsonb_build_array(jsonb_build_object('product_id', v_rice, 'quantity', 2, 'unit_price', 25))));
  reset role;
  select cost_price, stock_qty into v_cost, v_stock from products where id = v_rice;
  insert into t_results values ('W2', 'same key twice',
    'cost 67.65, stock 249', format('cost %s, stock %s', v_cost, v_stock), v_cost = 67.65 and v_stock = 249);

  -- W3: a sale moves stock only, never cost
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
    'paid', 750, 'items', jsonb_build_array(jsonb_build_object('product_id', v_rice, 'quantity', 10, 'unit_price', 75))));
  reset role;
  select cost_price, stock_qty into v_cost, v_stock from products where id = v_rice;
  insert into t_results values ('W3', 'sale of 10 kg @75',
    'cost 67.65, stock 239', format('cost %s, stock %s', v_cost, v_stock), v_cost = 67.65 and v_stock = 239);

  -- W4: zero stock → cost = the new unit cost (nothing to average with)
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'purchase',
    'paid', 1400, 'items', jsonb_build_array(jsonb_build_object('product_id', v_new, 'quantity', 10, 'unit_price', 140))));
  reset role;
  select cost_price, stock_qty into v_cost, v_stock from products where id = v_new;
  insert into t_results values ('W4', 'zero stock, 10 kg @140',
    'cost 140, stock 10', format('cost %s, stock %s', v_cost, v_stock), v_cost = 140 and v_stock = 10);

  -- W5: negative stock (sold before it was bought in) → also the new unit cost
  update products set stock_qty = -3, cost_price = 999 where id = v_new;
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'purchase',
    'paid', 1300, 'items', jsonb_build_array(jsonb_build_object('product_id', v_new, 'quantity', 10, 'unit_price', 130))));
  reset role;
  select cost_price, stock_qty into v_cost, v_stock from products where id = v_new;
  insert into t_results values ('W5', 'stock -3, 10 kg @130',
    'cost 130, stock 7', format('cost %s, stock %s', v_cost, v_stock), v_cost = 130 and v_stock = 7);
end $$;

select n, test, expected, actual, case when pass then 'PASS' else 'FAIL' end as result
from t_results order by length(n), n;

rollback;

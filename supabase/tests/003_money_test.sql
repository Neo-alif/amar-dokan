-- 003_money_test.sql — tests for 003_money_position.sql (money position, counts, supplier credit)
-- Run in the Supabase SQL Editor AFTER 003. Everything is inside begin … rollback: no row stays.
-- Output: one result grid, one row per check, last column PASS / FAIL.
-- Note: now() is fixed inside one transaction, so every transaction below gets an explicit
-- occurred_at (count at now(), money moves before/after it).

begin;

create temp table t_results (n text, test text, expected text, actual text, pass boolean);

do $$
declare
  v_shop uuid; v_prod uuid; v_cust uuid; v_supp uuid;
  v_diff numeric; v_due numeric; v_cnt int; v_stock numeric;
  r record; err text;
  before timestamptz := now() - interval '1 minute';
  after1 timestamptz := now() + interval '1 minute';
  after2 timestamptz := now() + interval '2 minutes';
  after3 timestamptz := now() + interval '3 minutes';
  after4 timestamptz := now() + interval '4 minutes';
  item1 jsonb;
begin
  insert into shops (name) values ('TEST money shop') returning id into v_shop;
  insert into products (shop_id, name_bn, cost_price, sell_price, stock_qty)
    values (v_shop, 'সয়াবিন তেল', 30, 340, 10) returning id into v_prod;
  insert into customers (shop_id, name) values (v_shop, 'রহিম') returning id into v_cust;
  insert into suppliers (shop_id, name) values (v_shop, 'করিম ট্রেডার্স') returning id into v_supp;
  item1 := jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'unit_price', 340));

  set local role service_role;
  -- cash sale 680, 580 paid now, 100 baki · bkash sale 340 fully paid
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
    'customer_id', v_cust, 'paid', 580, 'occurred_at', before,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price', 340))));
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
    'method', 'bkash', 'paid', 340, 'occurred_at', before, 'items', item1));
  reset role;

  -- M1: never counted → balance = flows by method
  select string_agg(format('%s %s', account, balance::numeric(12,2)), ', ' order by account) into err from money_position(v_shop);
  insert into t_results values ('M1', 'balances before any count (by method)',
    'bank 0.00, bkash 340.00, cash 580.00', err, err = 'bank 0.00, bkash 340.00, cash 580.00');

  -- M2: owner counts 500 cash → difference −80 stored with expected 580
  set local role service_role;
  v_diff := count_money(v_shop, 'cash', 500, 'খুচরা দিয়েছি');
  reset role;
  select * into r from money_counts where shop_id = v_shop and account = 'cash';
  insert into t_results values ('M2', 'মিলিয়ে নিন: count cash 500',
    'difference -80, expected 580, note saved',
    format('difference %s, expected %s, note %s', v_diff, r.expected, r.note),
    v_diff = -80 and r.expected = 580 and r.note = 'খুচরা দিয়েছি');

  -- M3: cash expense 100 after the count → cash = 500 − 100
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'expense',
    'total', 100, 'expense_category', 'চা', 'occurred_at', after1));
  reset role;
  select * into r from money_position(v_shop) where account = 'cash';
  insert into t_results values ('M3', 'after count: cash expense 100',
    'counted 500, in 0, out 100, balance 400',
    format('counted %s, in %s, out %s, balance %s', r.counted, r.money_in, r.money_out, r.balance),
    r.counted = 500 and r.money_in = 0 and r.money_out = 100 and r.balance = 400);

  -- M4: purchase on credit: 10 × 30 = 300, 100 cash now, 200 দেনা to the supplier
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'purchase',
    'supplier_id', v_supp, 'paid', 100, 'occurred_at', after2,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 10, 'unit_price', 30))));
  reset role;
  select due_balance into v_due from suppliers where id = v_supp;
  select count(*) into v_cnt from supplier_ledger where supplier_id = v_supp and change = 200;
  select stock_qty into v_stock from products where id = v_prod;
  select balance into v_diff from money_position(v_shop) where account = 'cash';
  insert into t_results values ('M4', 'purchase on credit 300, paid 100',
    'supplier due 200, ledger +200, stock 17, cash 300',
    format('supplier due %s, ledger rows %s, stock %s, cash %s', v_due, v_cnt, v_stock, v_diff),
    v_due = 200 and v_cnt = 1 and v_stock = 17 and v_diff = 300);

  -- M5: credit purchase without a supplier → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'purchase',
      'paid', 0, 'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'unit_price', 30))));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('M5', 'credit purchase without supplier', 'SUPPLIER_REQUIRED_FOR_DUE', err, err = 'SUPPLIER_REQUIRED_FOR_DUE');

  -- M6: paying the supplier more than owed → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'payment',
      'supplier_id', v_supp, 'paid', 250));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('M6', 'supplier payment 250 > দেনা 200', 'PAYMENT_EXCEEDS_DUE', err, err = 'PAYMENT_EXCEEDS_DUE');

  -- M7: pay the supplier 200 from the bank → দেনা 0, bank −200 (never counted)
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'payment',
    'supplier_id', v_supp, 'paid', 200, 'method', 'bank', 'occurred_at', after3));
  reset role;
  select due_balance into v_due from suppliers where id = v_supp;
  select balance into v_diff from money_position(v_shop) where account = 'bank';
  select count(*) into v_cnt from supplier_ledger where supplier_id = v_supp and change = -200;
  insert into t_results values ('M7', 'supplier payment 200 by bank',
    'supplier due 0, ledger −200, bank -200',
    format('supplier due %s, ledger rows %s, bank %s', v_due, v_cnt, v_diff),
    v_due = 0 and v_cnt = 1 and v_diff = -200);

  -- M8: customer pays 100 baki by bKash → due 0, bkash 440
  set local role service_role;
  perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'payment',
    'customer_id', v_cust, 'paid', 100, 'method', 'bkash', 'occurred_at', after4));
  reset role;
  select due_balance into v_due from customers where id = v_cust;
  select balance into v_diff from money_position(v_shop) where account = 'bkash';
  insert into t_results values ('M8', 'customer payment 100 by bKash',
    'customer due 0, bkash 440', format('customer due %s, bkash %s', v_due, v_diff), v_due = 0 and v_diff = 440);

  -- M9: unknown payment method → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
      'method', 'nagad', 'paid', 340, 'items', item1));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('M9', 'unknown method', 'BAD_METHOD', err, err = 'BAD_METHOD');

  -- M10: customer and supplier on one transaction → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object('idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'payment',
      'customer_id', v_cust, 'supplier_id', v_supp, 'paid', 10));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('M10', 'customer + supplier together', 'ONE_PARTY_ONLY', err, err = 'ONE_PARTY_ONLY');

  -- M11: today_summary: spend = expense 100 + purchase 300; collected = customer payments only
  select * into r from today_summary where shop_id = v_shop;
  insert into t_results values ('M11', 'today_summary after 003',
    'sales 1020, spend 400, collected 100',
    format('sales %s, spend %s, collected %s', r.sales, r.spend, r.collected),
    r.sales = 1020 and r.spend = 400 and r.collected = 100);

  -- M12: anon can't read counts or call the money functions
  begin
    set local role anon;
    perform 1 from money_counts limit 1;
    err := 'no error';
  exception when others then err := sqlstate;
  end;
  reset role;
  begin
    set local role anon;
    perform count_money(v_shop, 'cash', 1, null);
    err := err || ' / no error';
  exception when others then err := err || ' / ' || sqlstate;
  end;
  reset role;
  insert into t_results values ('M12', 'anon reads money_counts / calls count_money',
    '42501 / 42501', err, err = '42501 / 42501');

  -- M13: bad count input
  begin
    set local role service_role;
    perform count_money(v_shop, 'cash', -5, null);
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  insert into t_results values ('M13', 'negative count', 'AMOUNT_REQUIRED', err, err = 'AMOUNT_REQUIRED');

  -- M14: least privilege on the new tables (002's default privileges apply)
  select count(*) filter (where has_table_privilege('service_role', t, 'TRUNCATE') or has_table_privilege('service_role', t, 'TRIGGER')),
         count(*) filter (where has_table_privilege('service_role', t, 'SELECT') and has_table_privilege('service_role', t, 'INSERT')
                            and has_table_privilege('service_role', t, 'UPDATE') and has_table_privilege('service_role', t, 'DELETE'))
    into v_cnt, v_stock
    from unnest(array['public.suppliers', 'public.supplier_ledger', 'public.money_counts']) t;
  insert into t_results values ('M14', 'service_role on new tables',
    'extra privs 0, CRUD on 3', format('extra privs %s, CRUD on %s', v_cnt, v_stock), v_cnt = 0 and v_stock = 3);
end $$;

select n, test, expected, actual, case when pass then 'PASS' else 'FAIL' end as result
from t_results order by length(n), n;

rollback;

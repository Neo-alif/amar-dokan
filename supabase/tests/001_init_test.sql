-- 001_init_test.sql — smoke tests for 001_init.sql + 002_tighten_service_role.sql
-- Run in the Supabase SQL Editor AFTER both migrations. Everything is inside
-- begin … rollback, so no test row stays in the database.
-- Output: one result grid, one row per check, last column PASS / FAIL.

begin;

create temp table t_results (n text, test text, expected text, actual text, pass boolean);

do $$
declare
  v_shop  uuid;
  v_prod  uuid;
  v_cust  uuid;
  k1      uuid := gen_random_uuid();
  id1     uuid;
  id2     uuid;
  v_t     record;
  v_stock numeric;
  v_due   numeric;
  v_cnt   int;
  v_txns  int;
  err     text;
  sale    jsonb;
begin
  -- Setup (as postgres): one shop, one product (stock 10), one customer (due 0)
  insert into shops (name) values ('TEST shop') returning id into v_shop;
  insert into products (shop_id, name_bn, name_en, cost_price, sell_price, stock_qty)
    values (v_shop, 'সয়াবিন তেল', 'Soybean oil', 300, 340, 10) returning id into v_prod;
  insert into customers (shop_id, name) values (v_shop, 'রহিম') returning id into v_cust;

  sale := jsonb_build_object(
    'idempotency_key', k1, 'shop_id', v_shop, 'type', 'sale', 'customer_id', v_cust, 'paid', 580,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price', 340)));

  -- T1: sale + due, called as service_role (also proves service_role grants work)
  set local role service_role;
  id1 := apply_transaction(sale);
  reset role;
  select total, paid, due into v_t from transactions where id = id1;
  select stock_qty into v_stock from products where id = v_prod;
  select due_balance into v_due from customers where id = v_cust;
  select count(*) into v_cnt from customer_ledger where transaction_id = id1 and change = 100;
  insert into t_results values ('1', 'sale + due (as service_role)',
    'total 680, paid 580, due 100, stock 8, Rahim due 100, ledger +100',
    format('total %s, paid %s, due %s, stock %s, Rahim due %s, ledger rows %s', v_t.total, v_t.paid, v_t.due, v_stock, v_due, v_cnt),
    v_t.total = 680 and v_t.paid = 580 and v_t.due = 100 and v_stock = 8 and v_due = 100 and v_cnt = 1);

  -- T2: same idempotency key again → same id, nothing new written
  set local role service_role;
  id2 := apply_transaction(sale);
  reset role;
  select count(*) into v_cnt from transactions where idempotency_key = k1;
  select stock_qty into v_stock from products where id = v_prod;
  select due_balance into v_due from customers where id = v_cust;
  insert into t_results values ('2', 'duplicate idempotency key',
    'same id, 1 row, stock still 8, due still 100',
    format('same id %s, rows %s, stock %s, due %s', id1 = id2, v_cnt, v_stock, v_due),
    id1 = id2 and v_cnt = 1 and v_stock = 8 and v_due = 100);

  select count(*) into v_txns from transactions where shop_id = v_shop;

  -- T3: due without a customer → rejected, nothing written
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object(
      'idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale', 'paid', 0,
      'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'unit_price', 340))));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  select stock_qty into v_stock from products where id = v_prod;
  select count(*) into v_cnt from transactions where shop_id = v_shop;
  insert into t_results values ('3', 'due without customer',
    'error CUSTOMER_REQUIRED_FOR_DUE, stock still 8, no new transaction',
    format('%s, stock %s, new txns %s', err, v_stock, v_cnt - v_txns),
    err = 'CUSTOMER_REQUIRED_FOR_DUE' and v_stock = 8 and v_cnt = v_txns);

  -- T4a: payment larger than the customer's due → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object(
      'idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'payment',
      'customer_id', v_cust, 'paid', 150));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  select due_balance into v_due from customers where id = v_cust;
  insert into t_results values ('4a', 'overpayment: payment 150 > due 100',
    'error PAYMENT_EXCEEDS_DUE, due still 100',
    format('%s, due %s', err, v_due),
    err = 'PAYMENT_EXCEEDS_DUE' and v_due = 100);

  -- T4b: paid more than the sale total → rejected
  begin
    set local role service_role;
    perform apply_transaction(jsonb_build_object(
      'idempotency_key', gen_random_uuid(), 'shop_id', v_shop, 'type', 'sale',
      'customer_id', v_cust, 'paid', 1000,
      'items', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price', 340))));
    err := 'no error';
  exception when others then err := sqlerrm;
  end;
  reset role;
  select stock_qty into v_stock from products where id = v_prod;
  insert into t_results values ('4b', 'overpayment: paid 1000 > total 680',
    'error PAID_EXCEEDS_TOTAL, stock still 8',
    format('%s, stock %s', err, v_stock),
    err = 'PAID_EXCEEDS_TOTAL' and v_stock = 8);

  -- T5a: anon cannot read a table
  begin
    set local role anon;
    perform 1 from products limit 1;
    err := 'no error';
  exception when others then err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into t_results values ('5a', 'anon reads products',
    '42501 permission denied', err, err like '42501%');

  -- T5b: anon cannot call the money function
  begin
    set local role anon;
    perform apply_transaction(sale);
    err := 'no error';
  exception when others then err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into t_results values ('5b', 'anon calls apply_transaction',
    '42501 permission denied', err, err like '42501%');

  -- T5c: authenticated cannot read the summary view either
  begin
    set local role authenticated;
    perform 1 from today_summary limit 1;
    err := 'no error';
  exception when others then err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into t_results values ('5c', 'authenticated reads today_summary',
    '42501 permission denied', err, err like '42501%');

  -- T6: trigram index exists with extensions.gin_trgm_ops, and similarity() works
  select count(*) into v_cnt from pg_indexes
   where schemaname = 'public' and indexname = 'products_name_trgm' and indexdef like '%gin_trgm_ops%';
  insert into t_results values ('6', 'trigram index + similarity()',
    'index found 1, similarity > 0',
    format('index found %s, similarity %s', v_cnt,
           round(extensions.similarity('সয়াবিন তেল', 'সয়াবিন')::numeric, 2)),
    v_cnt = 1 and extensions.similarity('সয়াবিন তেল', 'সয়াবিন') > 0);

  -- T7 (after 002): service_role has exactly what the app needs, nothing more
  select count(*) into v_cnt from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r','v')
     and (has_table_privilege('service_role', c.oid, 'TRUNCATE')
       or has_table_privilege('service_role', c.oid, 'TRIGGER')
       or has_table_privilege('service_role', c.oid, 'REFERENCES'));
  select count(*) into v_txns from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('service_role', c.oid, 'SELECT')
     and has_table_privilege('service_role', c.oid, 'INSERT')
     and has_table_privilege('service_role', c.oid, 'UPDATE')
     and has_table_privilege('service_role', c.oid, 'DELETE');
  insert into t_results values ('7', 'service_role least privilege (after 002)',
    'extra privs on 0 objects, full CRUD on 8 tables',
    format('extra privs on %s objects, full CRUD on %s tables', v_cnt, v_txns),
    v_cnt = 0 and v_txns = 8);
end $$;

select n, test, expected, actual, case when pass then 'PASS' else 'FAIL' end as result
from t_results order by n;

rollback;

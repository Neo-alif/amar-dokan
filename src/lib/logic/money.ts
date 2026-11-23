// টাকার অবস্থা. Per-account balances come from the DB (money_position: last count + flows by
// payment method since then); this joins them into the home numbers. Pure, no I/O.
export const ACCOUNTS = ["cash", "bank", "bkash"] as const;
export type Account = (typeof ACCOUNTS)[number];
export type AccountRow = {
  account: Account; counted: number | null; counted_at: string | null; money_in: number; money_out: number; balance: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// মোট = নগদ + ব্যাংক + বিকাশ + পাওনা (customer dues) − দেনা (supplier dues)
export function moneyPosition(rows: AccountRow[], receivable: number, payable: number) {
  const get = (account: Account): AccountRow =>
    rows.find((r) => r.account === account) ?? { account, counted: null, counted_at: null, money_in: 0, money_out: 0, balance: 0 };
  const cash = get("cash"), bank = get("bank"), bkash = get("bkash");
  return {
    cash, bank, bkash,
    bankTotal: r2(bank.balance + bkash.balance),
    receivable, payable,
    total: r2(cash.balance + bank.balance + bkash.balance + receivable - payable),
  };
}
export type MoneyPosition = ReturnType<typeof moneyPosition>;

// পার্থক্য shown while the owner types: + = more than the app expected, − = less.
export const countDifference = (counted: number, expected: number) => r2(counted - expected);

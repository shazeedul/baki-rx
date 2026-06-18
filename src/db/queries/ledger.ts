import { getDb } from "@/db/schema";

export interface LedgerEntry {
  id: string;
  store_id: string;
  customer_id: string;
  entry_type: "sale" | "collection";
  total_amount: number;
  paid_amount: number;
  note: string | null;
  transaction_date: string;
  is_dirty: number;
  created_at: string;
}

export interface TopDefaulter {
  customer_id: string;
  name: string;
  phone: string;
  total_due: number;
}

export interface LedgerRow extends LedgerEntry {
  name: string;
  phone: string;
  due_amount: number;
}

export async function insertLedgerEntry(
  entry: Omit<LedgerEntry, "created_at">,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ledger_entries
       (id, store_id, customer_id, entry_type, total_amount, paid_amount, note, transaction_date, is_dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      entry.id,
      entry.store_id,
      entry.customer_id,
      entry.entry_type,
      entry.total_amount,
      entry.paid_amount,
      entry.note ?? null,
      entry.transaction_date,
    ],
  );
}

export async function getTotalDue(storeId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(
       CASE WHEN entry_type = 'sale' THEN (total_amount - paid_amount)
            WHEN entry_type = 'collection' THEN -paid_amount
            ELSE 0 END
     ), 0) AS total
     FROM ledger_entries WHERE store_id = ?`,
    [storeId],
  );
  return row?.total ?? 0;
}

export async function getTodayCollection(storeId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(paid_amount), 0) AS total
     FROM ledger_entries
     WHERE store_id = ? AND entry_type = 'collection' AND date(transaction_date) = date('now')`,
    [storeId],
  );
  return row?.total ?? 0;
}

export async function getTopDefaulters(
  storeId: string,
  limit = 20,
): Promise<TopDefaulter[]> {
  const db = await getDb();
  return db.getAllAsync<TopDefaulter>(
    `SELECT le.customer_id, c.name, c.phone,
            SUM(
              CASE
              WHEN le.entry_type = "sale" THEN le.total_amount - le.paid_amount
              WHEN le.entry_type = "collection" THEN -(le.paid_amount)
              ELSE 0
              END
            ) AS total_due
     FROM ledger_entries le
     JOIN customers c ON c.id = le.customer_id
     WHERE le.store_id = ?
     GROUP BY le.customer_id
     HAVING total_due > 0
     ORDER BY total_due DESC
     LIMIT ?`,
    [storeId, limit],
  );
}

export async function getLedgerEntries(
  storeId: string,
  opts: {
    fromDate?: string;
    toDate?: string;
    customerId?: string;
    customerSearch?: string;
    entryType?: "sale" | "collection";
    sortOrder?: "newest" | "oldest";
    limit?: number;
    offset?: number;
  } = {},
): Promise<LedgerRow[]> {
  const db = await getDb();
  const {
    fromDate,
    toDate,
    customerId,
    customerSearch,
    entryType,
    sortOrder = "newest",
    limit = 30,
    offset = 0,
  } = opts;

  const params: (string | number | null)[] = [storeId];
  let whereClause = "WHERE le.store_id = ?";

  if (fromDate) {
    whereClause += " AND date(le.transaction_date) >= ?";
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += " AND date(le.transaction_date) <= ?";
    params.push(toDate);
  }
  if (customerId) {
    whereClause += " AND le.customer_id = ?";
    params.push(customerId);
  }
  if (customerSearch) {
    whereClause += " AND (c.name LIKE ? OR c.phone LIKE ?)";
    const p = `%${customerSearch}%`;
    params.push(p, p);
  }
  if (entryType) {
    whereClause += " AND le.entry_type = ?";
    params.push(entryType);
  }

  const order = sortOrder === "oldest" ? "ASC" : "DESC";

  const rows = await db.getAllAsync<LedgerRow>(
    `SELECT le.*, c.name, c.phone,
            (le.total_amount - le.paid_amount) AS due_amount
     FROM ledger_entries le
     JOIN customers c ON c.id = le.customer_id
     ${whereClause}
     ORDER BY le.transaction_date ${order}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

export async function getFilteredSummary(
  storeId: string,
  opts: {
    fromDate?: string;
    toDate?: string;
    entryType?: "sale" | "collection";
  } = {},
): Promise<{ totalDue: number; totalCollected: number; netDue: number }> {
  const db = await getDb();
  const { fromDate, toDate, entryType } = opts;

  const params: (string | null)[] = [storeId];
  let whereClause = "WHERE store_id = ?";

  if (fromDate) {
    whereClause += " AND date(transaction_date) >= ?";
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += " AND date(transaction_date) <= ?";
    params.push(toDate);
  }
  if (entryType) {
    whereClause += " AND entry_type = ?";
    params.push(entryType);
  }

  const row = await db.getFirstAsync<{
    totalDue: number;
    totalCollected: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'sale' THEN total_amount ELSE 0 END), 0) AS totalDue,
       COALESCE(SUM(CASE WHEN entry_type = 'collection' THEN paid_amount ELSE 0 END), 0) AS totalCollected
     FROM ledger_entries ${whereClause}`,
    params,
  );

  const totalDue = row?.totalDue ?? 0;
  const totalCollected = row?.totalCollected ?? 0;
  return { totalDue, totalCollected, netDue: totalDue - totalCollected };
}

export interface CustomerLedgerEntry {
  id: string;
  entry_type: "sale" | "collection";
  total_amount: number;
  paid_amount: number;
  note: string | null;
  transaction_date: string;
  running_balance: number;
}

export async function getCustomerTotalDue(
  customerId: string,
  storeId: string,
): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ due: number }>(
    `SELECT COALESCE(SUM(
       CASE WHEN entry_type = 'sale' THEN (total_amount - paid_amount)
            ELSE -paid_amount
       END
     ), 0) AS due
     FROM ledger_entries
     WHERE customer_id = ? AND store_id = ?`,
    [customerId, storeId],
  );
  return row?.due ?? 0;
}

export async function getCustomerLedgerHistory(
  customerId: string,
  storeId: string,
): Promise<CustomerLedgerEntry[]> {
  const db = await getDb();
  return db.getAllAsync<CustomerLedgerEntry>(
    `SELECT id, entry_type, total_amount, paid_amount, note, transaction_date,
            SUM(
              CASE WHEN entry_type = 'sale' THEN (total_amount - paid_amount)
                   ELSE -paid_amount
              END
            ) OVER (
              ORDER BY created_at ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_balance
     FROM ledger_entries
     WHERE customer_id = ? AND store_id = ?
     ORDER BY created_at DESC`,
    [customerId, storeId],
  );
}

export async function getDirtyLedgerEntries(
  storeId: string,
): Promise<LedgerEntry[]> {
  const db = await getDb();
  return db.getAllAsync<LedgerEntry>(
    `SELECT * FROM ledger_entries WHERE store_id = ? AND is_dirty = 1`,
    [storeId],
  );
}

export async function markLedgerEntriesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE ledger_entries SET is_dirty = 0 WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function batchUpsertLedgerEntries(
  entries: LedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT OR IGNORE INTO ledger_entries
           (id, store_id, customer_id, entry_type, total_amount, paid_amount, note, transaction_date, is_dirty, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          entry.id,
          entry.store_id,
          entry.customer_id,
          entry.entry_type,
          entry.total_amount,
          entry.paid_amount,
          entry.note ?? null,
          entry.transaction_date,
          entry.created_at,
        ],
      );
    }
  });
}

export async function upsertLedgerEntryFromCloud(
  entry: LedgerEntry,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ledger_entries
       (id, store_id, customer_id, entry_type, total_amount, paid_amount, note, transaction_date, is_dirty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      entry.id,
      entry.store_id,
      entry.customer_id,
      entry.entry_type,
      entry.total_amount,
      entry.paid_amount,
      entry.note,
      entry.transaction_date,
      entry.created_at,
    ],
  );
}

export async function countDirty(storeId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM ledger_entries WHERE store_id = ? AND is_dirty = 1)
           + (SELECT COUNT(*) FROM customers WHERE store_id = ? AND is_dirty = 1) AS n`,
    [storeId, storeId],
  );
  return row?.n ?? 0;
}

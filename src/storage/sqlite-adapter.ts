// Minimal sqlite StorageAdapter using expo-sqlite. This is a small, promise-wrapped subset to be expanded later.
import { StorageAdapter, EntityRecord, ChangeRecord, StorageErrorCode } from '../types/sync';

let SQLite: any;
try {
  // lazy require to avoid errors in node tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SQLite = require('expo-sqlite');
} catch (e) {
  SQLite = null;
}

function txToPromise(db: any, fn: (tx: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction((tx: any) => {
      try {
        fn(tx);
      } catch (err) {
        reject(err);
      }
    }, (err: any) => reject(err), () => resolve());
  });
}

export class SqliteAdapter implements StorageAdapter {
  private db: any;
  private dbName = 'baki_local.db';

  constructor(dbName?: string) {
    if (dbName) this.dbName = dbName;
  }

  async open(): Promise<void> {
    if (!SQLite) {
      throw new Error('expo-sqlite not available in this environment');
    }
    this.db = SQLite.openDatabase(this.dbName);
    await txToPromise(this.db, (tx) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, data TEXT, rev INTEGER, updatedAt INTEGER);`
      );
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, entityId TEXT, type TEXT, data TEXT, rev INTEGER, createdAt INTEGER, applied INTEGER DEFAULT 0);`
      );
    });
  }

  async close(): Promise<void> {
    // expo-sqlite does not expose close; noop
  }

  private executeSql(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql(
          sql,
          params,
          (_: any, result: any) => resolve([result]),
          (_: any, err: any) => {
            reject(err);
            return false;
          }
        );
      });
    });
  }

  async get(entityId: string): Promise<EntityRecord | null> {
    const [result] = await this.executeSql('SELECT data, rev, updatedAt FROM entities WHERE id = ?;', [entityId]);
    if (result.rows.length === 0) return null;
    const row = result.rows.item(0);
    return { id: entityId, data: JSON.parse(row.data), rev: row.rev, updatedAt: row.updatedAt };
  }

  async put(entity: EntityRecord): Promise<void> {
    await this.executeSql(
      `INSERT OR REPLACE INTO entities (id, data, rev, updatedAt) VALUES (?, ?, ?, ?);`,
      [entity.id, JSON.stringify(entity.data), entity.rev, entity.updatedAt]
    );
  }

  async delete(entityId: string): Promise<void> {
    await this.executeSql(`DELETE FROM entities WHERE id = ?;`, [entityId]);
  }

  async getAll(prefix?: string): Promise<EntityRecord[]> {
    let sql = 'SELECT id, data, rev, updatedAt FROM entities;';
    let params: any[] = [];
    if (prefix) {
      sql = 'SELECT id, data, rev, updatedAt FROM entities WHERE id LIKE ?;';
      params = [`${prefix}%`];
    }
    const [result] = await this.executeSql(sql, params);
    const out: EntityRecord[] = [];
    if (result && result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        out.push({ id: row.id, data: JSON.parse(row.data), rev: row.rev, updatedAt: row.updatedAt });
      }
    }
    return out;
  }

  async addChange(change: ChangeRecord): Promise<number> {
    const data = change.data ? JSON.stringify(change.data) : null;
    const createdAt = change.createdAt || Date.now();
    const rev = change.rev ?? null;
    const [res] = await this.executeSql(
      `INSERT INTO changes (entityId, type, data, rev, createdAt, applied) VALUES (?, ?, ?, ?, ?, 0);`,
      [change.entityId, change.type, data, rev, createdAt]
    );
    return res.insertId;
  }

  async getPendingChanges(limit = 100): Promise<ChangeRecord[]> {
    const [res] = await this.executeSql(`SELECT id, entityId, type, data, rev, createdAt, applied FROM changes WHERE applied = 0 ORDER BY id ASC LIMIT ?;`, [limit]);
    const out: ChangeRecord[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows.item(i);
      out.push({ id: row.id, entityId: row.entityId, type: row.type, data: row.data ? JSON.parse(row.data) : undefined, rev: row.rev, createdAt: row.createdAt, applied: !!row.applied });
    }
    return out;
  }

  async markChangeApplied(changeId: number): Promise<void> {
    await this.executeSql(`UPDATE changes SET applied = 1 WHERE id = ?;`, [changeId]);
  }

  async runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    // For simplicity, just call the function. Advanced transaction support can wrap sqlite transactions.
    return fn(null);
  }
}


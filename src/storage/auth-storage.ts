import { Platform } from 'react-native';

export interface LocalSession {
  branch: string;
  mobile: string;
  storeId: string;
  tenantId: string;
  pinHash: string;
}

let SQLite: any;
try {
  SQLite = require('expo-sqlite');
} catch (e) {
  SQLite = null;
}

export async function saveLocalSession(session: LocalSession): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem('baki_auth_session', JSON.stringify(session));
    return;
  }

  if (!SQLite) {
    console.warn('expo-sqlite not available, session not persisted on native');
    return;
  }

  try {
    const db = SQLite.openDatabaseSync ? SQLite.openDatabaseSync('baki_local.db') : SQLite.openDatabase('baki_local.db');
    if (db.runAsync) {
      await db.runAsync(
        'CREATE TABLE IF NOT EXISTS local_auth (id TEXT PRIMARY KEY, data TEXT);'
      );
      await db.runAsync(
        'INSERT OR REPLACE INTO local_auth (id, data) VALUES (?, ?);',
        ['session', JSON.stringify(session)]
      );
    } else {
      // old callback api
      await new Promise<void>((resolve, reject) => {
        db.transaction((tx: any) => {
          tx.executeSql('CREATE TABLE IF NOT EXISTS local_auth (id TEXT PRIMARY KEY, data TEXT);');
          tx.executeSql(
            'INSERT OR REPLACE INTO local_auth (id, data) VALUES (?, ?);',
            ['session', JSON.stringify(session)],
            () => resolve(),
            (_: any, err: any) => { reject(err); return false; }
          );
        });
      });
    }
  } catch (err) {
    console.error('Failed to save local session in SQLite:', err);
  }
}

export async function getLocalSession(): Promise<LocalSession | null> {
  if (Platform.OS === 'web') {
    const data = localStorage.getItem('baki_auth_session');
    return data ? JSON.parse(data) : null;
  }

  if (!SQLite) return null;

  try {
    const db = SQLite.openDatabaseSync ? SQLite.openDatabaseSync('baki_local.db') : SQLite.openDatabase('baki_local.db');
    if (db.getAllAsync) {
      await db.runAsync('CREATE TABLE IF NOT EXISTS local_auth (id TEXT PRIMARY KEY, data TEXT);');
      const rows = await db.getAllAsync('SELECT data FROM local_auth WHERE id = ?;', ['session']);
      if (rows && rows.length > 0) {
        return JSON.parse((rows[0] as any).data);
      }
    } else {
      // old callback api
      return await new Promise<LocalSession | null>((resolve, reject) => {
        db.transaction((tx: any) => {
          tx.executeSql('CREATE TABLE IF NOT EXISTS local_auth (id TEXT PRIMARY KEY, data TEXT);');
          tx.executeSql(
            'SELECT data FROM local_auth WHERE id = ?;',
            ['session'],
            (_: any, result: any) => {
              if (result.rows.length > 0) {
                resolve(JSON.parse(result.rows.item(0).data));
              } else {
                resolve(null);
              }
            },
            (_: any, err: any) => { reject(err); return false; }
          );
        });
      });
    }
  } catch (err) {
    console.error('Failed to get local session from SQLite:', err);
  }
  return null;
}

export async function clearLocalSession(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem('baki_auth_session');
    return;
  }

  if (!SQLite) return;

  try {
    const db = SQLite.openDatabaseSync ? SQLite.openDatabaseSync('baki_local.db') : SQLite.openDatabase('baki_local.db');
    if (db.runAsync) {
      await db.runAsync('DELETE FROM local_auth WHERE id = ?;', ['session']);
    } else {
      await new Promise<void>((resolve, reject) => {
        db.transaction((tx: any) => {
          tx.executeSql(
            'DELETE FROM local_auth WHERE id = ?;',
            ['session'],
            () => resolve(),
            (_: any, err: any) => { reject(err); return false; }
          );
        });
      });
    }
  } catch (err) {
    console.error('Failed to clear local session in SQLite:', err);
  }
}

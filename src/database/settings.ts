import type * as SQLite from 'expo-sqlite';

export async function readSetting(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const result = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
  return result?.value ?? null;
}
export async function writeSetting(db: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}

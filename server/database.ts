import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import type { ServerConfig } from './config';

type Parameter = string | number | null;
type Row = Record<string, unknown>;

// アプリのSQLは固定文だけ。値は常にパラメーターとして渡す。
export function createDatabase(config: ServerConfig) {
  if (config.databaseUrl) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 4,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    // 接続の切断が起きても、秘密を含み得る接続文字列・SQLをログへ出さない。
    pool.on('error', () =>
      console.error('データベース接続が切断されました。次回の接続で再試行します。'),
    );
    return {
      authDatabase: pool,
      async exec(sql: string) {
        await pool.query(sql);
      },
      prepare(sql: string) {
        let index = 0;
        const query = sql.replace(/\?/g, () => `$${++index}`);
        return {
          async get(...values: Parameter[]): Promise<Row | undefined> {
            return (await pool.query(query, values)).rows[0];
          },
          async run(...values: Parameter[]) {
            return { changes: (await pool.query(query, values)).rowCount ?? 0 };
          },
        };
      },
      async close() {
        await pool.end();
      },
    };
  }
  if (config.databasePath !== ':memory:')
    mkdirSync(dirname(config.databasePath), { recursive: true });
  const sqlite = new DatabaseSync(config.databasePath);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return {
    authDatabase: sqlite,
    async exec(sql: string) {
      sqlite.exec(sql);
    },
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        async get(...values: Parameter[]): Promise<Row | undefined> {
          return statement.get(...values);
        },
        async run(...values: Parameter[]) {
          return { changes: Number(statement.run(...values).changes) };
        },
      };
    },
    async close() {
      sqlite.close();
    },
  };
}

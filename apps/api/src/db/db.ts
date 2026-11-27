import pg from 'pg';

export const POOL = Symbol('POOL');

export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(connectionString: string, schema?: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    // A named schema lets tests run in isolation on a shared database.
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
}

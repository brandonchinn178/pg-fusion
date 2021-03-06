import * as pg from 'pg'

import { SqlQuery } from '../sql'
import { DatabaseClient, SqlRecord } from './client'
import { InsertOptions, InsertResult } from './insert'
import { MigrateOptions } from './migrate'

// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/49567
const { builtins } = (pg.types as unknown) as {
  builtins: Record<string, number>
}

// https://github.com/brianc/node-pg-types/issues/78
pg.types.setTypeParser(builtins.INT8, BigInt)

export type DatabaseConfig = pg.PoolConfig

/**
 * An interface to a PostgreSQL database.
 *
 * Methods like `query` or `migrate` can be called directly on the Database
 * object, which will automatically provision a client and proxy the function
 * to the client.
 *
 * Does not actually connect to the database until `withClient` or one of these
 * proxy methods are called.
 *
 * Usage:
 *
 *   db = new Database(<normal pg.Pool options>)
 *   const rows = await db.query(sql`SELECT * FROM song`)
 */
export class Database {
  private pool: pg.Pool

  constructor(config?: DatabaseConfig) {
    this.pool = new pg.Pool(config)
  }

  /**
   * Run actions on a single database client. More efficient than running
   * multiple queries from the pool.
   */
  async withClient<T>(
    callback: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    const pgClient = await this.pool.connect()
    const client = new DatabaseClient(pgClient)

    try {
      return await callback(client)
    } finally {
      pgClient.release()
    }
  }

  /**
   * Closes the pool and all clients in the pool.
   *
   * Should be called after the Database is finished being used.
   */
  async close(): Promise<void> {
    await this.pool.end()
  }

  /** Proxied methods to DatabaseClient **/

  async query<T extends SqlRecord>(query: SqlQuery): Promise<T[]> {
    return this.withClient((client) => client.query<T>(query))
  }

  async queryOne<T extends SqlRecord>(query: SqlQuery): Promise<T | null> {
    return this.withClient((client) => client.queryOne<T>(query))
  }

  async querySingle<T extends SqlRecord>(query: SqlQuery): Promise<T> {
    return this.withClient((client) => client.querySingle<T>(query))
  }

  async transaction<T>(
    callback: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    return this.withClient((client) => {
      return client.transaction<T>(() => callback(client))
    })
  }

  async execute(query: SqlQuery): Promise<void> {
    return this.withClient((client) => client.execute(query))
  }

  async executeAll(queries: SqlQuery[]): Promise<void> {
    return this.withClient((client) => client.executeAll(queries))
  }

  async insert<
    T extends SqlRecord,
    Options extends InsertOptions = Record<string, unknown>
  >(
    table: string,
    record: Partial<T>,
    options?: Options,
  ): Promise<InsertResult<T, Options>> {
    return this.withClient((client) =>
      client.insert<T, Options>(table, record, options),
    )
  }

  async insertAll<T extends SqlRecord>(
    table: string,
    records: Partial<T>[],
    options?: InsertOptions,
  ): Promise<T[]> {
    return this.withClient((client) =>
      client.insertAll<T>(table, records, options),
    )
  }

  async migrate(options?: MigrateOptions): Promise<void> {
    return this.withClient((client) => client.migrate(options))
  }

  async clear(): Promise<void> {
    return this.withClient((client) => client.clear())
  }
}

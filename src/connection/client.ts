import migrate from 'node-pg-migrate'
import * as pg from 'pg'

import { sql, SqlQuery } from '../sql'
import {
  InsertOptions,
  InsertResult,
  mkInsertQuery,
  toInsertResult,
} from './insert'
import { MigrateOptions } from './migrate'

export type SqlRecord = Record<string, unknown>

/**
 * A connected client to a PostgreSQL database.
 */
export class DatabaseClient {
  constructor(private readonly client: pg.PoolClient) {}

  /**
   * Run the given query and return the resulting rows.
   *
   * Usage:
   *
   *   const [song] = await client.query(sql`
   *     SELECT * FROM "song" WHERE "song"."name" = ${songName}
   *   `)
   *
   *   const allSongs = await client.query<{ name: string }>(sql`
   *     SELECT "name" FROM "song"
   *   `)
   */
  async query<T extends SqlRecord>(query: SqlQuery): Promise<T[]> {
    const { rows } = await this.client.query(query)
    return rows
  }

  /**
   * Run the given query and return the only row.
   *
   * Usage:
   *
   *   const { count } = await client.queryOne({
   *     text: 'SELECT COUNT(*) AS count FROM "song"',
   *   })
   */
  async queryOne<T extends SqlRecord>(query: SqlQuery): Promise<T> {
    const rows = await this.query<T>(query)
    if (rows.length !== 1) {
      throw new Error(`Expected one row, got: ${JSON.stringify(rows)}`)
    }
    return rows[0]
  }

  /**
   * Run the given callback within a transaction.
   *
   * Usage:
   *
   *   await client.transaction(async () => {
   *     const [artist] = await client.query(sql`
   *       SELECT * FROM artist WHERE artist.id = ${artistId}
   *     `)
   *     await client.query(sql`
   *       INSERT INTO song (name, artist)
   *       VALUES (${name}, ${artist.name})
   *     `)
   *   })
   */
  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.client.query(sql`BEGIN`)

    try {
      const result = await callback()
      await this.client.query(sql`COMMIT`)
      return result
    } catch (e) {
      await this.client.query(sql`ROLLBACK`)
      throw e
    }
  }

  /**
   * Execute the given query.
   *
   * Usage:
   *
   *   await client.execute(sql`UPDATE "song" SET name=${name} WHERE id=${id}`)
   */
  async execute(query: SqlQuery): Promise<void> {
    await this.executeAll([query])
  }

  /**
   * Run all the given queries in a single transaction.
   *
   * Usage:
   *
   *   await client.executeAll([
   *     sql`INSERT INTO "song" (name) VALUES (${name1})`,
   *     sql`INSERT INTO "song" (name, artist) VALUES (${name2}, ${artist})`,
   *   ])
   */
  async executeAll(queries: Array<SqlQuery>): Promise<void> {
    if (queries.length === 0) {
      return
    }

    await this.transaction(async () => {
      for (const query of queries) {
        await this.client.query(query)
      }
    })
  }

  /**
   * Insert the given entity and return the full row inserted.
   *
   * Usage:
   *
   *   // contains any defaulted column filled in, e.g. 'id'
   *   const insertedSong = await client.insert('song', {
   *     name: 'Take On Me',
   *     artist: 'A-ha',
   *   })
   */
  async insert<
    T extends SqlRecord,
    Options extends InsertOptions = Record<string, unknown>
  >(
    table: string,
    record: Partial<T>,
    options?: Options,
  ): Promise<InsertResult<T, Options>> {
    const query = mkInsertQuery(table, record, options)
    const rows = await this.query<T>(query)
    return toInsertResult(rows, options)
  }

  /**
   * Insert all of the given entities in a single transaction.
   *
   * Usage:
   *
   *   await client.insertAll('song', [
   *     { name: 'Take On Me', artist: 'A-ha' },
   *     { name: 'Separate Ways', artist: 'Journey' },
   *   ])
   */
  async insertAll<T extends SqlRecord>(
    table: string,
    records: Partial<T>[],
    options?: InsertOptions,
  ): Promise<T[]> {
    const result: T[] = []

    await this.transaction(async () => {
      for (const record of records) {
        const row = await this.insert<T, InsertOptions>(table, record, options)
        if (row) {
          result.push(row)
        }
      }
    })

    return result
  }

  /**
   * Run migrations using node-pg-migrate.
   *
   * Accepts same options as node-pg-migrate, except instead of
   *
   *   direction: 'up' | 'down'
   *
   * accepts
   *
   *   action: 'up' | 'down' | 'redo'
   *
   * to match the CLI option. Also automatically provides the following defaults
   * to mirror CLI defaults:
   *   - migrationsTable: 'pgmigrations'
   *   - dir: 'migrations'
   *   - direction: 'up'
   *   - count: Infinity
   *
   * Usage:
   *
   *   await client.migrate()
   */
  async migrate(options: MigrateOptions = {}): Promise<void> {
    const { action = 'up', ...nodePgMigrateOptions } = options

    const directions = action === 'redo' ? ['down', 'up'] : [action]

    for (const direction of directions) {
      await migrate({
        dbClient: this.client,
        migrationsTable: 'pgmigrations',
        dir: 'migrations',
        direction: direction as 'up' | 'down',
        count: Infinity,
        ...nodePgMigrateOptions,
      })
    }
  }

  /**
   * A test helper to clear all tables in the database.
   *
   * Usage:
   *
   *   await client.clear()
   */
  async clear(): Promise<void> {
    await this.transaction(async () => {
      const tables = await this.query<{ table: string }>(sql`
        SELECT table_name AS table FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `)

      if (tables.length > 0) {
        const truncationList = tables.map(
          ({ table }) => sql`"public".${sql.quote(table)}`,
        )

        await this.query(sql`
          TRUNCATE ${sql.join(truncationList, ',')} RESTART IDENTITY
        `)
      }
    })
  }
}

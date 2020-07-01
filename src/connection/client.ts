import migrate, { RunnerOption } from 'node-pg-migrate'
import * as pg from 'pg'

import { sql, SqlQuery } from '~/sql'

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
    records: T[],
  ): Promise<void> {
    const queries = records.map((record) => {
      const columnNames = Object.keys(record)
      const values = columnNames.map((columnName) => record[columnName])

      const columnNamesSql = sql.join(columnNames.map(sql.quote), ',')
      const valuesSql = sql.join(values.map(sql.param), ',')

      return sql`
        INSERT INTO ${sql.quote(table)} (${columnNamesSql})
        VALUES (${valuesSql})
      `
    })

    await this.executeAll(queries)
  }

  /**
   * Run migrations using node-pg-migrate.
   *
   * See https://salsita.github.io/node-pg-migrate/#/api for available options.
   * This function will automatically provide the following defaults (mirroring
   * the CLI):
   *   - migrationsTable: 'pgmigrations'
   *   - dir: 'migrations'
   *   - direction: 'up'
   *   - count: Infinity
   *
   * Usage:
   *
   *   await client.migrate({
   *     migrationsTable: 'migrations',
   *     direction: 'up' as const,
   *     dir: 'migrations',
   *     count: Infinity,
   *   })
   */
  async migrate(options: Partial<RunnerOption> = {}): Promise<void> {
    await migrate({
      dbClient: this.client,
      migrationsTable: 'pgmigrations',
      dir: 'migrations',
      direction: 'up',
      count: Infinity,
      ...options,
    })
  }
}
---
---

# pg-fusion
{:.no_toc}

* TOC
{:toc}

# Overview

This package combines the features of multiple libraries into a single unified interface to get your PostgreSQL-backed application up and running quickly. Especially useful for projects that do not want to use ORMs, for whatever reason. This library provides an interface that roughly combines the interfaces of the following libraries:

* [`pg`](https://node-postgres.com/)
* [`node-pg-migrate`](https://salsita.github.io/node-pg-migrate/#/)
* [`squid`](https://github.com/andywer/squid)
* [`database-cleaner`](https://github.com/emerleite/node-database-cleaner)

Features include:

* Automatic pool/client/transaction management
* A SQL query builder that automatically parametrizes values
* Integrated migration runner (backed by `node-pg-migrate`)
* Test helpers for clearing databases and unit testing SQL queries

# Features

## Database querying

- Initialization and clean up as easy as using `pg.Pool` directly

  ```ts
  import { Database } from 'pg-toolbox'

  const db = new Database(/* normal pg.Pool options */)

  // Use database

  await db.close()
  ```

- A helper for getting, using, and releasing a client

  ```ts
  db.withClient(async (client) => {
    const rows = await client.query(...)
    return rows.map(...)
  })
  ```

- A SQL query builder that automatically parametrizes values

  ```ts
  import { sql } from 'pg-toolbox'

  /**
   * When executed, will run the SQL query
   *
   *   SELECT * FROM song WHERE song.name = $1
   *
   * with the values
   *
   *   [songName]
   */
  const query = sql`
    SELECT * FROM song
    WHERE song.name = ${songName}
  `
  ```

  The `sql` tagged template function is heavily influenced by the [`squid`](https://github.com/andywer/squid) library. This library provides a reimplemented version of `squid`'s `sql` tagged template function because `squid` is focused on keeping queries statically inspectable for `postguard`, which greatly restricts what one can do with `sql`.

- Helpers for querying and executing queries

  ```ts
  await db.withClient(async (client) => {
    const songs = await client.query(sql`SELECT * FROM song`)

    // errors if 0 or more than 1 row comes back
    const numSongs = await client.queryOne(sql`SELECT COUNT(*) FROM song`)

    // execute a query
    await client.execute(sql`UPDATE song SET name=${name} WHERE id=${id}`)

    // execute multiple queries in a single transaction
    await client.executeAll([
      sql`INSERT INTO song (name) VALUES (${song1})`,
      sql`INSERT INTO song (name) VALUES (${song2})`,
    ])
  })

  // All client methods are proxied through Database
  const songs = await db.query(sql`SELECT * FROM song`)
  ```

- A helper for running queries in a single transaction

  ```ts
  await db.withClient(async (client) => {
    await client.transaction(() => {
      await client.query(sql`INSERT INTO song (name) VALUES (${song1})`)

      return client.query(sql`SELECT * FROM song`)
    })
  })

  // Equivalent to above
  await db.transaction(async (client) => {
    await client.query(sql`INSERT INTO song (name) VALUES (${song1})`)

    return client.query(sql`SELECT * FROM song`)
  })
  ```

- A helper for inserting records into a table

  ```ts
  await db.withClient(async (client) => {
    await client.insert('song', { name: song1 })
    await client.insertAll('song', [{ name: song2 }, { name: song3 }])
  })

  // Equivalent to above
  await db.insert('song', { name: song1 })
  await db.insertAll('song', [{ name: song2 }, { name: song3 }])
  ```

## Test helpers

- A test helper for clearing all tables

  ```ts
  await db.withClient(async (client) => {
    await client.clear()
  })

  // Equivalent to above
  await db.clear()
  ```

- Jest matchers for testing SQL queries, which ignores whitespace differences

  ```ts
  const db = new Database(...)
  const querySpy = jest.spyOn(db, 'query')
  await db.insert('song', { name: song1 })

  expect(querySpy).toHaveBeenCalledWith(
    expect.sqlMatching({
      text: 'INSERT INTO "song" ("name") VALUES ($1)',
      values: [song1],
    })
  )

  const query = sql`
    SELECT * FROM song
    WHERE song.name = ${song1}
  `
  expect(query).toMatchSql({
    text: 'SELECT * FROM song WHERE song.name = $1',
    values: [song1],
  })
  ```

  To use these Jest matchers, add the following code to your
  [tests setup file](https://jestjs.io/docs/en/configuration.html#setupfilesafterenv-array):

  ```js
  // with ES6 imports
  import 'pg-toolbox/testutils/extend-expect'

  // with require
  require('pg-toolbox/testutils/extend-expect')
  ```

## Database migrations

- A helper for running migrations with `node-pg-migrate`

  ```ts
  await db.withClient(async (client) => {
    await client.migrate()
  })

  // Equivalent to above
  await db.migrate()
  ```

  The `migrate` function is a thin wrapper around `node-pg-migrate`, but having this built-in integration means you could use the same configuration for database migrations as normal database usage.

# API

## Database

A `Database` represents a PostgreSQL database connection pool ([docs](https://node-postgres.com/features/pooling)). It primarily provides the following functions:

* `new Database(config?: DatabaseConfig)`

  Creates a new `Database` with the given options. Does not actually connect to the database until a client actually needs to connect (e.g. when calling `db.query()`).

  Accepts the same options as `pg.Pool`. Just like `pg.Pool`, you can configure your database connection via [an options object, environment variables, or a PostgreSQL connection string](https://node-postgres.com/features/connecting).

  See the [`node-postgres` docs](https://node-postgres.com/api/pool#constructor) for more information.

* `db.withClient<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>`

  Connect to the database and use that connection in the given callback. If you're running multiple queries at once, this is more efficient than running each query as a one-off.

* `db.close(): Promise<void>`

  Close the pool and all clients in the pool. Should be called when the Database is finished being used.

Additionally, every `DatabaseClient` function can be called directly from a `Database`, which is equivalent to calling `db.withClient()` and calling the corresponding function on the `client` provided. For example,

```ts
const rows = await db.query(sql`...`)
```

is equivalent to

```ts
const rows = await db.withClient((client) => {
  return client.query(sql`...`)
})
```

The only exception is `db.transaction`, which also provides the `client` to the `callback`:

```ts
await db.transaction(async (client) => {
  ...
})
```

## DatabaseClient

A `DatabaseClient` represents a connection to a PostgreSQL database. You should get a `DatabaseClient` from `db.withClient`, which ensures that the connection is closed when the callback is finished.

* `client.query<T>(query: SqlQuery): Promise<T[]>`

  Run the given `SqlQuery` and return the results as a list of rows. Each row is returned as an object, with keys corresponding to the names of the columns in the result.

* `client.queryOne<T>(query: SqlQuery): Promise<T>`

  A helper that calls `client.query()` and expects exactly 1 row to come back, throwing an error otherwise. Useful for aggregate queries like `COUNT(*)`.

* `client.transaction<T>(callback: () => Promise<T>): Promise<T>`

  Run the given `callback` within a transaction. If an error is thrown in the callback (i.e. the promise was rejected), the transaction is rolled back. Otherwise, it's committed. PostgreSQL does support transactions-in-transactions, so you can nest `client.transaction` if needed.

* `client.execute(query: SqlQuery): Promise<void>`

  Equivalent to `client.executeAll([query])`

* `client.executeAll(queries: Array<SqlQuery>): Promise<void>`

  Execute all the given queries in a single transaction.

* `client.insert<T>(table: string, record: Partial<T>): Promise<T>`

  Insert the given record into the given table. Returns the inserted row, with default values populated:

  ```ts
  await client.insert('my_table', { foo: 'hello', bar: 1 })

  // runs:
  //   INSERT INTO my_table (foo, bar) VALUES ($1, $2) RETURNING * -- ['hello', 1]
  ```

* `client.insertWith<T>(table: string, record: Partial<T>, options: InsertOptions): Promise<T | null>`

  Same as `client.insert()` except allows passing in the following options:

  * `onConflict`: What to do in event of inserting duplicate rows. When not specified, throws an error. This option may also be set to:
    * The string `'ignore'`, which is an alias for `{ action: 'ignore' }`
    * An object with:
      * `action`: either `'ignore'` or `'update'`:
          * `ignore` means to ignore duplicate rows. If a duplicate row was ignored, `.insert()` returns `null`.
          * `update` means to replace the existing row with the record being inserted. If `update` is specified, either `column` or `constraint` MUST be specified.
      * `column`: The column with a `UNIQUE` constraint to check for conflicts. Cannot be specified with `constraint`.
      * `constraint`: The name of the constraint to check for conflicts. Cannot be specified with `column`.

* `client.insertAll<T>(table: string, records: T[], options?: InsertOptions): Promise<void>`

  Insert the given records into the given table, throwing away the result. The records may contain different columns; e.g. if the record had fields `foo` and `bar` and an optional field `baz`:

  ```ts
  await client.insertAll('my_table', [
    { foo: 'hello', bar: 1 },
    { foo: 'world', bar: 0, baz: 'a' },
  ])

  // runs:
  //   INSERT INTO my_table (foo, bar) VALUES ($1, $2)          -- ['hello', 1]
  //   INSERT INTO my_table (foo, bar, baz) VALUES ($1, $2, $3) -- ['world', 0, 'a']
  ```

  Accepts the same options as `client.insert`.

* `client.migrate(options?: MigrateOptions): Promise<void>`

  Run migrations using `node-pg-migrate`. See the [`node-pg-migrate` docs](https://salsita.github.io/node-pg-migrate/#/migrations) for information on how to write these migrations.

  Accepts the same options as the [`node-pg-migrate` programmatic API](https://salsita.github.io/node-pg-migrate/#/api), with the following exceptions, in order to match the CLI:

  * Instead of `direction: 'up' | 'down'`, accepts `action: 'up' | 'down' | 'redo'`, which defaults to `'up'`
  * `migrationsTable` defaults to `'pgmigrations'`
  * `dir` defaults to `'migrations'`
  * `count` defaults to `Infinity`

  If you're writing a standalone migration script, you can load CLI args the same as `node-pg-migrate` using `loadCLIMigrateArgs`:

  ```ts
  // scripts/migrate.ts
  #!/usr/bin/env ts-node-script

  import { Database, loadCLIMigrateArgs } from 'pg-toolbox'

  const cliMigrateArgs = loadCLIMigrateArgs()
  const db = new Database(...)
  await db.migrate({
    ...cliMigrateArgs,
    // other options
  })
  await db.close()
  ```

  ```bash
  $ scripts/migrate.ts up
  $ scripts/migrate.ts --help
  ```

* `client.clear(): Promise<void>`

  A test helper to clear all the tables in the database. Useful in integration tests to start with a fresh database before each test. e.g. with Jest:

  ```ts
  const db = new Database(...)

  beforeEach(async () => {
    await db.clear()
  })
  ```

## SqlQuery

A `SqlQuery` can only be constructed with the `sql` tagged template function, which prevents one from accidentally passing in a string vulnerable to SQL injections into `client.query(...)`. By default, any interpolated values will be parametrized using SQL placeholders:

```ts
const name = 'Take On Me'
const artist = 'A-ha'

await client.query(sql`
  SELECT * FROM song
  WHERE song.name = ${name}
  AND song.artist = ${artist}
`)

/* Executes the query
 *
 *   SELECT * FROM song
 *   WHERE song.name = $1
 *   AND song.artist = $2
 *
 * with the values
 *
 *   ['Take On Me', 'A-ha']
 */
```

A `SqlQuery` can also be a part of a query, which can be combined with other `SqlQuery`s:

```ts
const condition1 = sql`song.name = ${name}`
const condition2 = sql`song.artist = ${artist}`
await client.query(sql`
  SELECT * FROM song
  WHERE ${condition1} AND ${condition2}
`)
```

If you absolutely need to avoid parametrizing, you can use `sql.raw`, but be very careful with this, as it could leave you open to SQL injection attacks.

```ts
const attribute = 'name'
await client.query(sql`
  SELECT ${sql.raw(attribute)} FROM song
`)
```

`sql.raw` on a static string is the same as using the tagged template function. The following two expressions are equivalent.

```ts
sql.raw('hello world')
sql`hello world`
```

This library also provides some other helpers that may be useful:

* `sql.quote(identifier: string): SqlQuery`

  Adds quotes around the given identifier. Same warnings as `sql.raw` apply here.

  ```ts
  const table = 'song'
  await client.query(sql`
    SELECT name FROM ${sql.quote(table)}
  `)
  ```

* `sql.join(queries: SqlQuery[], delimiter = ''): SqlQuery`

  Joins the given queries with the given delimiter.

  ```ts
  const columns = ['name', 'artist']
  const columnsSql = columns.map(sql.raw)
  await client.query(sql`
    SELECT ${sql.join(columnsSql, ',')} FROM song
  `)
  ```

* `sql.and(clauses: SqlQuery[]): SqlQuery`

  A helper for joining the given clauses with `AND`. If no clauses are provided, returns `TRUE`.

  ```ts
  const conditions = [
    sql`song.name = ${name}`,
    sql`song.artist = ${artist}`,
  ]
  await client.query(sql`
    SELECT * FROM song WHERE ${sql.and(conditions)}
  `)
  ```

* `sql.or(clauses: SqlQuery[]): SqlQuery`

  A helper for joining the given clauses with `OR`. If no clauses are provided, returns `FALSE`.

  ```ts
  const conditions = [
    sql`song.name = ${name}`,
    sql`song.artist = ${artist}`,
  ]
  await client.query(sql`
    SELECT * FROM song WHERE ${sql.or(conditions)}
  `)
  ```

### Jest helpers

In general, database functions should be tested with integration tests that actually go to the database and verify that the query works. However, maybe the query itself isn't complicated, but the logic to determine which query to run is complicated, and you want to verify that with a unit test. This library provides some custom Jest matchers that will compare two queries, ignoring whitespace differences, and ensure they match.

* `expect(...).toMatchSql`

  ```ts
  const name = 'Take On Me'
  const query = sql`
    SELECT * FROM song
    WHERE song.name = ${name}
  `

  expect(query).toMatchSql({
    text: 'SELECT * FROM song WHERE song.name = $1',
    values: [name],
  })

  expect(query).not.toMatchSql({
    text: 'SELECT * FROM song',
    values: [],
  })

  // passing just a string is equivalent to passing with `values: []`
  expect(query).not.toMatchSql('SELECT * FROM song')
  ```

* `expect.sqlMatching`

  ```ts
  const querySpy = jest.spyOn(db, 'query')
  await db.insert('song', { name: song1 })

  expect(querySpy).toHaveBeenCalledWith(
    expect.sqlMatching({
      text: 'INSERT INTO "song" ("name") VALUES ($1)',
      values: [song1],
    })
  )

  expect(querySpy).toHaveBeenCalledWith(
    expect.not.sqlMatching(`
      INSERT INTO "song" ("name") VALUES ('')
    `)
  )
  ```

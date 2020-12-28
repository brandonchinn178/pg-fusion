# pg-fusion

[![npm](https://img.shields.io/npm/v/pg-fusion)](https://npmjs.com/package/pg-fusion)
[![Codecov](https://img.shields.io/codecov/c/github/brandonchinn178/pg-fusion)](https://codecov.io/gh/brandonchinn178/pg-fusion)
[![CircleCI](https://img.shields.io/circleci/build/github/brandonchinn178/pg-fusion/main)](https://app.circleci.com/pipelines/github/brandonchinn178/pg-fusion)

This package combines the features of multiple libraries into a single unified interface to get your PostgreSQL-backed application up and running quickly. Especially useful for projects that do not want to use ORMs, for whatever reason. This library provides an interface that roughly combines the interfaces of the following libraries:

* `pg` and `pg-pool`
* `node-pg-migrate`
* `squid`
* `database-cleaner`

Features include:

* Automatic pool/client/transaction management
* A SQL query builder that automatically parametrizes values
* Integrated migration runner (backed by `node-pg-migrate`)
* Test helpers for clearing databases and unit testing SQL queries

## Usage

```ts
import { Database, sql } from 'pg-fusion'

async function getSongs(db: Database) {
  // Will be parametrized, to prevent SQL injection attacks
  const name = 'Take On Me'

  const songs = await db.query(sql`
    SELECT * FROM song
    WHERE song.name = ${name}
  `)

  return songs
}

async function run() {
  const db = new Database(/* normal pg.Pool options */)

  const songs = await getSongs(db)
  console.log(songs)

  await db.close()
}
```

```ts
import 'pg-fusion/testutils/extend-expect'

test('getSongs', () => {
  const db = new Database(...)
  const querySpy = jest.spyOn(db, 'query')
  await getSongs(db)

  expect(querySpy).toHaveBeenCalledWith(
    expect.sqlMatching({
      // Ignores whitespace differences
      text: 'SELECT * FROM song WHERE song.name = $1',
      values: ['Take On Me'],
    })
  )

  // Equivalently
  expect(querySpy.mock.calls[0][0]).toMatchSql({
    text: 'SELECT * FROM song WHERE song.name = $1',
    values: ['Take On Me'],
  })
})
```

## Build

```bash
yarn build
```

## Tests

### Run unit tests

```bash
yarn test
```

### Run end-to-end tests

1. Run a Postgres server in Docker

   ```bash
   docker run -d -p 5432:5432 \
       -e POSTGRES_HOST_AUTH_METHOD=trust \
       -e POSTGRES_DB=pg_fusion_test \
       --name pg-fusion-test \
       postgres:12
   ```

1. `yarn test:e2e`

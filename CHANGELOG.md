# Unreleased

# 0.2.1

Make `db.insertAll` accept partial rows, just like `client.insertAll`

# 0.2.0

* Return inserted rows in `insertAll`
* `insertAll` accepts partial records, just like `insert`
* `insert` and `insertWith` are now combined into a single `insert` function. The function is smart enough to inspect the options and return `T | null` only if `onConflict=ignore`, and `T` otherwise.

# 0.1.1

Add single `db.execute()` and `client.execute()` functions, which are equivalent to calling `.executeAll()` with a single-element array.

# 0.1.0

Break up `db.insert()` and `client.insert()` into `.insert()` and `.insertWith()`, where `.insert()` no longer takes any options and returns `Promise<T>` and `insertWith` requires options and returns `Promise<T | null>`.

# 0.0.4

Add `db.insert()` and `client.insert()`, which inserts a single record and
returns the inserted row.

# 0.0.3

Move `expect` back into `dependencies`.

# 0.0.2

Fixed bug in deployment.

# 0.0.1

Initial release with:

* `Database`
* `DatabaseClient`
* `sql` tagged template function
* Built-in `node-pg-migrate` integration
* Custom jest matchers `expect().toMatchSql()` and `expect.sqlMatching()`

# Unreleased

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

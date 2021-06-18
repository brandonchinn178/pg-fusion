import { sql, SqlQuery } from '../sql'

export type InsertOptions = {
  onConflict?: ConflictOptions | null
}

export type InsertResult<T, Options extends InsertOptions> = ConflictType<
  Options['onConflict']
> extends 'ignore'
  ? T | null
  : T

export const mkInsertQuery = <T extends Record<string, unknown>>(
  table: string,
  record: T,
  options: InsertOptions = {},
): SqlQuery => {
  const { onConflict = null } = options

  const columnNames = Object.keys(record)
  const values = columnNames.map((columnName) => record[columnName])

  const columnNamesSql = sql.join(columnNames.map(sql.quote), ',')
  const valuesSql = sql.join(values.map(sql.param), ',')

  const conflictClause = mkConflictClause(columnNamesSql, valuesSql, onConflict)

  return sql`
    INSERT INTO ${sql.quote(table)} (${columnNamesSql})
    VALUES (${valuesSql})
    ${conflictClause}
    RETURNING *
  `
}

export const toInsertResult = <T, Options extends InsertOptions>(
  rows: T[],
  options?: Options,
): InsertResult<T, Options> => {
  if (rows.length > 1) {
    throw new Error(
      `INSERT statement unexpectedly returned multiple rows: ${rows}`,
    )
  }

  const row = rows.length === 1 ? rows[0] : null

  const conflictOptions = options?.onConflict
  const isNullableResult =
    conflictOptions &&
    (conflictOptions === 'ignore' || conflictOptions.action === 'ignore')
  if (!isNullableResult && row === null) {
    throw new Error(`INSERT statement unexpectedly returned no rows`)
  }

  return row as InsertResult<T, Options>
}

type ConflictTarget = { column: string } | { constraint: string }

type ConflictOptions =
  | 'ignore'
  | ({ action: 'ignore' } & Partial<ConflictTarget>)
  | ({ action: 'update' } & ConflictTarget)

type ConflictType<Options> = Options extends ConflictOptions
  ? Options extends 'ignore'
    ? 'ignore'
    : Options extends { action: 'ignore' }
    ? 'ignore'
    : 'update'
  : null

const mkConflictClause = (
  columnNamesSql: SqlQuery,
  valuesSql: SqlQuery,
  options: ConflictOptions | null,
): SqlQuery => {
  if (options === null) {
    return sql``
  }

  const { action, ...target } =
    options === 'ignore' ? { action: 'ignore' as const } : options

  const targetClause =
    'constraint' in target && target.constraint
      ? sql`ON CONSTRAINT ${sql.quote(target.constraint)}`
      : 'column' in target && target.column
      ? sql`(${sql.quote(target.column)})`
      : sql``

  switch (action) {
    case 'ignore':
      return sql`ON CONFLICT ${targetClause} DO NOTHING`
    case 'update':
      return sql`
        ON CONFLICT ${targetClause} DO UPDATE
        SET (${columnNamesSql}) = (${valuesSql})
      `
  }
}

import * as fc from 'fast-check'

import { extendExpect } from '~test-utils'

import { InsertOptions, mkInsertQuery, toInsertResult } from './insert'

extendExpect()

describe('mkInsertQuery', () => {
  it('returns the correct INSERT statement', async () => {
    const songs = [
      { name: 'Take On Me', artist: 'A-ha', rating: 5 },
      { name: 'Separate Ways', artist: 'Journey' },
    ]

    expect(songs.map((song) => mkInsertQuery('song', song))).toEqual([
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","artist","rating")
          VALUES ($1,$2,$3)
          RETURNING *
        `,
        values: ['Take On Me', 'A-ha', 5],
      }),
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","artist")
          VALUES ($1,$2)
          RETURNING *
        `,
        values: ['Separate Ways', 'Journey'],
      }),
    ])
  })

  it('defaults to onConflict=null', async () => {
    const song = { name: 'Take On Me' }

    expect(mkInsertQuery('song', song)).toEqualJSON(
      mkInsertQuery('song', song, { onConflict: null }),
    )
  })

  it('implements onConflict=ignore', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(mkInsertQuery('song', song, { onConflict: 'ignore' })).toEqual(
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","rating") VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          RETURNING *
        `,
        values: ['Take On Me', 5],
      }),
    )
  })

  test('onConflict=ignore is equivalent to onConflict={ action: ignore }', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(mkInsertQuery('song', song, { onConflict: 'ignore' })).toEqualJSON(
      mkInsertQuery('song', song, { onConflict: { action: 'ignore' } }),
    )
  })

  it('implements onConflict=ignore with column', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(
      mkInsertQuery('song', song, {
        onConflict: { action: 'ignore', column: 'name' },
      }),
    ).toEqual(
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","rating") VALUES ($1,$2)
          ON CONFLICT ("name") DO NOTHING
          RETURNING *
        `,
        values: ['Take On Me', 5],
      }),
    )
  })

  it('implements onConflict=ignore with constraint', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(
      mkInsertQuery('song', song, {
        onConflict: { action: 'ignore', constraint: 'unique_name' },
      }),
    ).toEqual(
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","rating") VALUES ($1,$2)
          ON CONFLICT ON CONSTRAINT "unique_name" DO NOTHING
          RETURNING *
        `,
        values: ['Take On Me', 5],
      }),
    )
  })

  it('implements onConflict=update with column', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(
      mkInsertQuery('song', song, {
        onConflict: { action: 'update', column: 'name' },
      }),
    ).toEqual(
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","rating") VALUES ($1,$2)
          ON CONFLICT ("name") DO UPDATE SET ("name","rating") = ($3,$4)
          RETURNING *
        `,
        values: ['Take On Me', 5, 'Take On Me', 5],
      }),
    )
  })

  it('implements onConflict=update with constraint', async () => {
    const song = { name: 'Take On Me', rating: 5 }

    expect(
      mkInsertQuery('song', song, {
        onConflict: { action: 'update', constraint: 'unique_name' },
      }),
    ).toEqual(
      expect.sqlMatching({
        text: `
          INSERT INTO "song" ("name","rating") VALUES ($1,$2)
          ON CONFLICT ON CONSTRAINT "unique_name" DO UPDATE SET ("name","rating") = ($3,$4)
          RETURNING *
        `,
        values: ['Take On Me', 5, 'Take On Me', 5],
      }),
    )
  })
})

describe('toInsertResult', () => {
  it('errors with multiple rows', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 2 }),
        fc.anything(),
        (rows, options) => {
          expect(() => toInsertResult(rows, options as InsertOptions)).toThrow()
        },
      ),
    )
  })

  it('returns single row', () => {
    fc.assert(
      fc.property(
        fc.anything().filter(Boolean),
        fc.anything(),
        (row, options) => {
          expect(toInsertResult([row], options as InsertOptions)).toBe(row)
        },
      ),
    )
  })

  it('errors with no rows without onConflict specified', () => {
    expect(() => toInsertResult([])).toThrow()
    expect(() => toInsertResult([], undefined)).toThrow()
    expect(() => toInsertResult([], {})).toThrow()
  })

  it('returns null with no rows with onConflict=ignore', () => {
    expect(toInsertResult([], { onConflict: 'ignore' })).toBeNull()
    expect(toInsertResult([], { onConflict: { action: 'ignore' } })).toBeNull()
  })

  it('errors with no rows with onConflict=update', () => {
    expect(() =>
      toInsertResult([], { onConflict: { action: 'update', column: 'name' } }),
    ).toThrow()
  })
})

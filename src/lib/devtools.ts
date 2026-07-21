// DEV-ONLY debugging hook. Vite tree-shakes this out of production builds
// (`import.meta.env.DEV` is statically false there), so it never ships.
//
// Lets us drive the charts without a live Claude API key:
//   __ht.seed()            fill the last 30 days with plausible sample data
//   __ht.run(sql, params)  run any statement
//   __ht.wipe()            clear every table
import { getDb, persist } from '../db/sqlite'
import { uid } from './id'
import { dateSpine } from './dates'
import { daysAgoISO } from './dates'

export function installDevtools(): void {
  if (!import.meta.env.DEV) return
  const api = {
    run: (sql: string, params: unknown[] = []) => {
      getDb().run(sql, params as never)
      return persist()
    },
    all: (sql: string) => {
      const r = getDb().exec(sql)
      return r.length ? r[0].values : []
    },
    wipe: async () => {
      for (const t of ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meals', 'tracks']) {
        getDb().run(`DELETE FROM ${t}`)
      }
      await persist()
    },
    seed: async () => {
      const db = getDb()
      const spine = dateSpine(daysAgoISO(29))
      const put = (sql: string, p: unknown[]) => db.run(sql, p as never)
      spine.forEach((d, i) => {
        // energy / mood wander a bit
        put('INSERT INTO wellbeing(id, date, energy, mood) VALUES (?,?,?,?)', [uid(), d, 5 + ((i * 3) % 5), 4 + ((i * 5) % 6)])
        put('INSERT INTO day_context(id, date, stress_load) VALUES (?,?,?)', [uid(), d, (i * 7) % 9])
        // movement: dancing twice a week, biking every 3rd day, a workout weekly
        if (i % 7 === 2 || i % 7 === 5) put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), d, 'dancing', 'activity', 45 + (i % 3) * 15, 'min'])
        if (i % 3 === 0) put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), d, 'biking', 'activity', 20 + (i % 4) * 10, 'min'])
        if (i % 7 === 1) put('INSERT INTO activities(id, date, type, duration_min) VALUES (?,?,?,?)', [uid(), d, 'strength workout', 50])
        // practices
        if (i % 2 === 0) put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), d, 'meditation', 'practice', 15 + (i % 3) * 5, 'min'])
        if (i % 4 === 1) put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), d, 'breath work', 'practice', 10, 'min'])
        // a nagging knee that flares mid-range
        if (i > 8 && i < 22) put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), d, 'knee pain', 'symptom', 2 + ((i - 8) % 5), '/10'])
        // meals
        put('INSERT INTO meals(id, date, name, calories, protein_g, fat_g, carbs_g, fiber_g, source) VALUES (?,?,?,?,?,?,?,?,?)', [uid(), d, 'day total', 1800 + ((i * 137) % 700), 90, 70, 200, 25, 'text'])
      })
      // a cold that starts on day 10 and is logged gone on day 17
      put('INSERT INTO infections(id, date, kind, severity) VALUES (?,?,?,?)', [uid(), spine[10], 'cold', 'moderate'])
      put('INSERT INTO infections(id, date, kind, severity) VALUES (?,?,?,?)', [uid(), spine[13], 'cold', 'severe'])
      put('INSERT INTO infections(id, date, kind, severity) VALUES (?,?,?,?)', [uid(), spine[17], 'cold', 'gone'])
      // gut episodes
      put('INSERT INTO gut_events(id, date, pain, bloating, stool_consistency, warming_bottle_needed) VALUES (?,?,?,?,?,?)', [uid(), spine[5], 6, 5, 6, 1])
      put('INSERT INTO gut_events(id, date, pain, bloating, stool_consistency, warming_bottle_needed) VALUES (?,?,?,?,?,?)', [uid(), spine[12], 4, 3, 3, 0])
      put('INSERT INTO gut_events(id, date, pain, bloating, stool_consistency, warming_bottle_needed) VALUES (?,?,?,?,?,?)', [uid(), spine[24], 7, 6, 7, 1])
      // release entries
      put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), spine[6], 'release', 'release', 100, '%'])
      put('INSERT INTO tracks(id, date, name, category, value, unit) VALUES (?,?,?,?,?,?)', [uid(), spine[19], 'release', 'release', 60, '%'])
      await persist()
      location.reload()
    },
  }
  ;(window as unknown as Record<string, unknown>).__ht = api
}

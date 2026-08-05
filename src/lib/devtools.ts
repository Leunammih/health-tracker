// DEV-ONLY debugging hook. Vite tree-shakes this out of production builds
// (`import.meta.env.DEV` is statically false there), so it never ships.
//
// Lets us drive the charts without a live Claude API key:
//   __ht.seed()            fill the last 30 days with plausible sample data
//   __ht.run(sql, params)  run any statement
//   __ht.wipe()            clear every table
import { getDb, persist } from '../db/sqlite'
import { saveDiaryExtraction } from '../db/queries'
import { uid } from './id'
import { dateSpine } from './dates'
import { daysAgoISO } from './dates'
import type { DiaryExtraction } from '../types'

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
    // Run the diary save path with a hand-written extraction, so the routing and
    // merge rules can be exercised without spending an API call.
    saveExtraction: (partial: Partial<DiaryExtraction>, entryDate: string) =>
      saveDiaryExtraction('(devtools)', 'text', {
        summary: '', activities: [], gut_events: [], infections: [],
        wellbeing: [], day_context: [], tracks: [], follow_up_questions: [],
        ...partial,
      }, entryDate),
    wipe: async () => {
      for (const t of ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meal_items', 'meals', 'tracks', 'segment_values', 'events', 'supplements', 'foods']) {
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
    // seed() writes one 'day total' meal per day with no meal_type/time/ingredients —
    // fine for the charts, useless for testing the foods backfill (ensureFoodSeed),
    // which mines meals.ingredients JSON. This writes real per-meal-slot meals with
    // ingredient lists instead, so the backfill and the ranked ingredient grid have
    // something realistic to work with.
    seedMeals: async (days = 21) => {
      const db = getDb()
      const spine = dateSpine(daysAgoISO(days - 1))
      const put = (sql: string, p: unknown[]) => db.run(sql, p as never)
      const BREAKFASTS = [
        { name: 'Avocado & eggs on rye', time: '08:15', ings: [['avocado', '1/2'], ['egg', '2'], ['rye bread', '1 slice']], kcal: 420, p: 22, f: 26, c: 30, fb: 9 },
        { name: 'Oats with banana', time: '07:50', ings: [['rolled oats', '60g'], ['banana', '1'], ['peanut butter', '1 tbsp']], kcal: 390, p: 14, f: 15, c: 55, fb: 8 },
      ]
      const LUNCHES = [
        { name: 'Chicken, rice & broccoli', time: '13:00', ings: [['chicken breast', '150g'], ['rice', '100g'], ['broccoli', '80g']], kcal: 520, p: 42, f: 10, c: 60, fb: 6 },
        { name: 'Lentil salad', time: '12:45', ings: [['lentils', '120g'], ['tomato', '1'], ['olive oil', '1 tbsp'], ['feta', '30g']], kcal: 430, p: 20, f: 18, c: 45, fb: 12 },
      ]
      const DINNERS = [
        { name: 'Salmon & potatoes', time: '19:15', ings: [['salmon', '150g'], ['potato', '200g'], ['green beans', '80g']], kcal: 560, p: 38, f: 22, c: 45, fb: 7 },
        { name: 'Pasta with meatballs', time: '19:30', ings: [['pasta', '100g'], ['beef meatballs', '150g'], ['tomato sauce', '100g']], kcal: 610, p: 32, f: 20, c: 65, fb: 5 },
      ]
      const pick = (arr: typeof BREAKFASTS, i: number) => arr[i % arr.length]
      spine.forEach((d, i) => {
        const meals = [
          ['breakfast', pick(BREAKFASTS, i)],
          ['lunch', pick(LUNCHES, i)],
          ['dinner', pick(DINNERS, i)],
        ] as const
        for (const [type, m] of meals) {
          const ingredients = JSON.stringify(m.ings.map(([name, quantity]) => ({ name, quantity })))
          put(
            'INSERT INTO meals(id, date, time, name, calories, protein_g, fat_g, carbs_g, fiber_g, ingredients, source, meal_type, confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)',
            [uid(), d, m.time, m.name, m.kcal, m.p, m.f, m.c, m.fb, ingredients, 'text', type],
          )
        }
      })
      await persist()
      location.reload()
    },
  }
  ;(window as unknown as Record<string, unknown>).__ht = api
}

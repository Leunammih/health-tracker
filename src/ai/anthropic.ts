import Anthropic from '@anthropic-ai/sdk'
import type { DiaryExtraction, MealAnalysis, MultiMealItem, FoodProfile } from '../types'
import { loadSettings } from '../lib/storage'
import { DIARY_TOOL, MEAL_TOOL, MULTI_MEAL_TOOL, INTERPRET_TOOL, FOOD_TOOL } from './schemas'
import {
  diarySystemPrompt, refineSystemPrompt, mealSystemPrompt, multiMealSystemPrompt, interpretSystemPrompt,
  foodProfileSystemPrompt,
} from './prompts'

function client(): Anthropic {
  const { anthropicKey } = loadSettings()
  if (!anthropicKey) throw new Error('No Anthropic API key set. Add it in Settings.')
  return new Anthropic({
    apiKey: anthropicKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  })
}

function model(): string {
  return loadSettings().model || 'claude-sonnet-5'
}

type Block = Anthropic.Messages.ContentBlock
type ToolInput = Record<string, unknown>

function firstToolInput(content: Block[], name: string): ToolInput {
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === name) {
      return block.input as ToolInput
    }
  }
  throw new Error('Model did not return the expected structured output.')
}

// ---- Diary extraction ----

export async function extractDiary(
  rawText: string,
  entryDate: string,
  multiDay = false,
): Promise<DiaryExtraction> {
  const res = await client().messages.create({
    model: model(),
    // A multi-day entry fans out into many more records, so give it more room.
    max_tokens: multiDay ? 4096 : 2048,
    system: diarySystemPrompt(entryDate, multiDay),
    tools: [DIARY_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: DIARY_TOOL.name },
    messages: [{ role: 'user', content: rawText }],
  })
  return normaliseDiary(firstToolInput(res.content, DIARY_TOOL.name))
}

// Merge original entry + Q/A answers into a final extraction.
export async function refineDiary(
  rawText: string,
  qa: { question: string; answer: string }[],
  entryDate: string,
): Promise<DiaryExtraction> {
  const answers = qa.map((x) => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n')
  const res = await client().messages.create({
    model: model(),
    max_tokens: 2048,
    system: refineSystemPrompt(entryDate),
    tools: [DIARY_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: DIARY_TOOL.name },
    messages: [
      { role: 'user', content: `Original diary entry:\n${rawText}\n\nFollow-up answers:\n${answers}` },
    ],
  })
  return normaliseDiary(firstToolInput(res.content, DIARY_TOOL.name))
}

function normaliseDiary(input: ToolInput): DiaryExtraction {
  return {
    summary: (input.summary as string) ?? '',
    activities: (input.activities as DiaryExtraction['activities']) ?? [],
    gut_events: (input.gut_events as DiaryExtraction['gut_events']) ?? [],
    infections: (input.infections as DiaryExtraction['infections']) ?? [],
    wellbeing: (input.wellbeing as DiaryExtraction['wellbeing']) ?? [],
    day_context: (input.day_context as DiaryExtraction['day_context']) ?? [],
    tracks: (input.tracks as DiaryExtraction['tracks']) ?? [],
    follow_up_questions: (input.follow_up_questions as string[]) ?? [],
  }
}

// ---- Meal photo analysis ----

export async function analyseMeal(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  hint?: string,
  entryDate?: string,
  entryTime?: string,
): Promise<MealAnalysis> {
  const content: Array<Anthropic.Messages.ImageBlockParam | Anthropic.Messages.TextBlockParam> = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
  ]
  if (hint) content.push({ type: 'text', text: `Extra context from the user: ${hint}` })

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1536,
    system: mealSystemPrompt(entryDate, entryTime),
    tools: [MEAL_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: MEAL_TOOL.name },
    messages: [{ role: 'user', content }],
  })
  return normaliseMeal(firstToolInput(res.content, MEAL_TOOL.name))
}

// ---- Meal text (dictated) analysis ----

export async function analyseMealText(text: string, entryDate?: string, entryTime?: string): Promise<MealAnalysis> {
  const res = await client().messages.create({
    model: model(),
    max_tokens: 1536,
    system: mealSystemPrompt(entryDate, entryTime),
    tools: [MEAL_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: MEAL_TOOL.name },
    messages: [{ role: 'user', content: text }],
  })
  return normaliseMeal(firstToolInput(res.content, MEAL_TOOL.name))
}

// ---- Multi-meal text (dictated) analysis ----

export async function analyseMealsText(
  text: string,
  referenceDate: string,
  multiDay = false,
): Promise<MultiMealItem[]> {
  const res = await client().messages.create({
    model: model(),
    // A multi-day entry fans out into many more records, so give it more room.
    max_tokens: multiDay ? 4096 : 3072,
    system: multiMealSystemPrompt(referenceDate, multiDay),
    tools: [MULTI_MEAL_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: MULTI_MEAL_TOOL.name },
    messages: [{ role: 'user', content: text }],
  })
  const input = firstToolInput(res.content, MULTI_MEAL_TOOL.name)
  const meals = (input.meals as ToolInput[]) ?? []
  return meals.map((m) => ({
    date: (m.date as string) || referenceDate,
    meal_time: (m.meal_time as string) ?? '',
    name: (m.name as string) ?? 'Meal',
    ingredients: (m.ingredients as MultiMealItem['ingredients']) ?? [],
    calories: Number(m.calories ?? 0),
    protein_g: Number(m.protein_g ?? 0),
    fat_g: Number(m.fat_g ?? 0),
    carbs_g: Number(m.carbs_g ?? 0),
    fiber_g: Number(m.fiber_g ?? 0),
    confidence: (m.confidence as MultiMealItem['confidence']) ?? 'medium',
    meal_type: m.meal_type as MultiMealItem['meal_type'],
    food_groups: m.food_groups as MultiMealItem['food_groups'],
  }))
}

function normaliseMeal(input: ToolInput): MealAnalysis {
  return {
    name: (input.name as string) ?? 'Meal',
    ingredients: (input.ingredients as MealAnalysis['ingredients']) ?? [],
    calories: Number(input.calories ?? 0),
    protein_g: Number(input.protein_g ?? 0),
    fat_g: Number(input.fat_g ?? 0),
    carbs_g: Number(input.carbs_g ?? 0),
    fiber_g: Number(input.fiber_g ?? 0),
    confidence: (input.confidence as MealAnalysis['confidence']) ?? 'medium',
    clarifying_questions: (input.clarifying_questions as string[]) ?? [],
    meal_type: input.meal_type as MealAnalysis['meal_type'],
    food_groups: input.food_groups as MealAnalysis['food_groups'],
  }
}

// ---- Food profile lookup (tap-to-build meal builder) ----
//
// Unlike every other function here, this is called once per NEW ingredient and
// the result is stored forever, not re-estimated per meal — see FOOD_TOOL's
// comment in schemas.ts. `names` is array-shaped so "one new ingredient" and
// "fill in the N the backfill left macro-less" cost exactly one request either way.

export async function describeFoods(names: string[], context?: string): Promise<FoodProfile[]> {
  if (!names.length) return []
  const res = await client().messages.create({
    model: model(),
    max_tokens: Math.min(4096, 320 + 220 * names.length),
    system: foodProfileSystemPrompt(context),
    tools: [FOOD_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: FOOD_TOOL.name },
    messages: [{ role: 'user', content: names.map((n, i) => `${i + 1}. ${n}`).join('\n') }],
  })
  const input = firstToolInput(res.content, FOOD_TOOL.name)
  const foods = (input.foods as ToolInput[]) ?? []
  return foods.map(normaliseFoodProfile)
}

const FOOD_STATES = new Set(['raw', 'cooked', 'dry', 'as_sold'])

// These numbers are written once and trusted for months, so unlike normaliseMeal
// (a fresh estimate every time, self-correcting on the next call) a hallucinated
// outlier here needs to be caught rather than just coerced. Anything clamped drops
// confidence to 'low' so the picker sheet visibly flags it for a manual look.
function clamp(value: unknown, lo: number, hi: number, flag: { clamped: boolean }): number {
  const n = Number(value ?? 0)
  const safe = Number.isFinite(n) ? n : 0
  if (safe < lo || safe > hi) flag.clamped = true
  return Math.min(hi, Math.max(lo, safe))
}

function normaliseFoodProfile(input: ToolInput): FoodProfile {
  const flag = { clamped: false }
  const kcal_100g = clamp(input.kcal_100g, 0, 900, flag) // pure fat tops out ~884
  const protein_100g = clamp(input.protein_100g, 0, 100, flag)
  const fat_100g = clamp(input.fat_100g, 0, 100, flag)
  const carbs_100g = clamp(input.carbs_100g, 0, 100, flag)
  const fiber_100g = clamp(input.fiber_100g, 0, 100, flag)
  const serving_g = clamp(input.serving_g, 1, 2000, flag)
  const state = FOOD_STATES.has(input.state as string) ? (input.state as FoodProfile['state']) : 'as_sold'
  const rawConfidence = (input.confidence as FoodProfile['confidence']) ?? 'medium'
  return {
    query: (input.query as string) || (input.name as string) || '',
    name: (input.name as string) || 'Ingredient',
    brand: (input.brand as string) || undefined,
    state,
    kcal_100g,
    protein_100g,
    fat_100g,
    carbs_100g,
    fiber_100g,
    serving_g,
    serving_label: (input.serving_label as string) || '1 serving',
    food_groups: (input.food_groups as FoodProfile['food_groups']) ?? {
      vegan: 1, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0,
    },
    confidence: flag.clamped ? 'low' : rawConfidence,
    note: (input.note as string) || undefined,
  }
}

// ---- Interpretation ----

export async function interpret(dataJson: string, period: string): Promise<{ patterns: string; correlations: string; period_covered: string; model: string }> {
  const usedModel = model()
  const res = await client().messages.create({
    model: usedModel,
    max_tokens: 2048,
    system: interpretSystemPrompt(),
    tools: [INTERPRET_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: INTERPRET_TOOL.name },
    messages: [{ role: 'user', content: `Period: ${period}\n\nData (JSON):\n${dataJson}` }],
  })
  const input = firstToolInput(res.content, INTERPRET_TOOL.name)
  return {
    patterns: (input.patterns as string) ?? '',
    correlations: (input.correlations as string) ?? '',
    period_covered: (input.period_covered as string) ?? period,
    model: usedModel,
  }
}

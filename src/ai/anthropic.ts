import Anthropic from '@anthropic-ai/sdk'
import type { DiaryExtraction, MealAnalysis, MultiMealItem } from '../types'
import { loadSettings } from '../lib/storage'
import { DIARY_TOOL, MEAL_TOOL, MULTI_MEAL_TOOL, INTERPRET_TOOL } from './schemas'
import {
  diarySystemPrompt, refineSystemPrompt, mealSystemPrompt, multiMealSystemPrompt, interpretSystemPrompt,
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
): Promise<MealAnalysis> {
  const content: Array<Anthropic.Messages.ImageBlockParam | Anthropic.Messages.TextBlockParam> = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
  ]
  if (hint) content.push({ type: 'text', text: `Extra context from the user: ${hint}` })

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1536,
    system: mealSystemPrompt(),
    tools: [MEAL_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: MEAL_TOOL.name },
    messages: [{ role: 'user', content }],
  })
  return normaliseMeal(firstToolInput(res.content, MEAL_TOOL.name))
}

// ---- Meal text (dictated) analysis ----

export async function analyseMealText(text: string): Promise<MealAnalysis> {
  const res = await client().messages.create({
    model: model(),
    max_tokens: 1536,
    system: mealSystemPrompt(),
    tools: [MEAL_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: 'tool', name: MEAL_TOOL.name },
    messages: [{ role: 'user', content: text }],
  })
  return normaliseMeal(firstToolInput(res.content, MEAL_TOOL.name))
}

// ---- Multi-meal text (dictated) analysis ----

export async function analyseMealsText(text: string, referenceDate: string): Promise<MultiMealItem[]> {
  const res = await client().messages.create({
    model: model(),
    max_tokens: 3072,
    system: multiMealSystemPrompt(referenceDate),
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

// JSON schemas used as Anthropic "tools" to force structured output.

const precededBy = {
  type: 'array',
  items: { type: 'string', enum: ['travel', 'ceremony', 'work_project', 'online_work', 'transition', 'other'] },
}

// Shared between MEAL_TOOL and MULTI_MEAL_TOOL (their ingredient sub-schemas are
// already separately duplicated below — this one stays a single constant so a
// future field only needs to change in one place).
const foodGroups = {
  type: 'object',
  description:
    'What fraction of this meal (by mass/calories, not ingredient count) came from each source. Should sum to roughly 1. Grains, vegetables, fruit, legumes, tofu, and oil all count as vegan.',
  properties: {
    vegan: { type: 'number', description: '0-1' },
    dairy_eggs: { type: 'number', description: '0-1' },
    meat_beef: { type: 'number', description: '0-1' },
    meat_chicken: { type: 'number', description: '0-1' },
    meat_fish: { type: 'number', description: '0-1, includes other seafood' },
    meat_other: { type: 'number', description: '0-1, pork/lamb/duck/etc.' },
  },
  required: ['vegan', 'dairy_eggs', 'meat_beef', 'meat_chicken', 'meat_fish', 'meat_other'],
}

export const DIARY_TOOL = {
  name: 'record_health_log',
  description:
    'Record a structured health log parsed from a free-form diary entry. Only include fields the user actually mentioned; leave others out. Ask follow-up questions for important missing details.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One or two sentence plain summary of what was logged.' },
      activities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO YYYY-MM-DD; default today if unspecified' },
            type: { type: 'string', description: 'e.g. run, yoga, strength, hike' },
            duration_min: { type: 'number' },
            intensity: { type: 'string', description: 'e.g. light, moderate, hard, or a rating' },
            felt_during: { type: 'string' },
            symptom_onset: { type: 'string', description: 'when symptoms/aches started' },
            symptoms: { type: 'string' },
            recovery_time: { type: 'string', description: 'time to full recovery' },
            gentle_movement_effect: { type: 'string', enum: ['helped', 'hurt', 'neutral', 'unknown'] },
            notes: { type: 'string' },
          },
        },
      },
      gut_events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            pain: { type: 'number', description: '0-10' },
            bloating: { type: 'number', description: '0-10' },
            preceded_by: precededBy,
            stool_consistency: { type: 'number', description: 'Bristol scale 1-7' },
            warming_bottle_needed: { type: 'boolean', description: 'needed a warming bottle at night' },
            notes: { type: 'string' },
          },
        },
      },
      infections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            kind: { type: 'string', description: 'e.g. cold, flu, sore throat' },
            severity: { type: 'string' },
            preceded_by: precededBy,
            notes: { type: 'string' },
          },
        },
      },
      wellbeing: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            energy: { type: 'number', description: '0-10' },
            mood: { type: 'number', description: '0-10' },
            notes: { type: 'string' },
          },
        },
      },
      day_context: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            tasks: { type: 'string' },
            travel: { type: 'string' },
            work: { type: 'string' },
            retreat: { type: 'string' },
            relaxation: { type: 'string' },
            stress_load: { type: 'number', description: '0-10 overall stress load' },
            notes: { type: 'string' },
          },
        },
      },
      tracks: {
        type: 'array',
        description:
          'Generic trackable items to graph over time that are NOT exercise-with-soreness bouts (those go in activities) and NOT supplements/vitamins/pills (those are a yes/no regimen tracked separately by the app\'s Supplements feature — never put them here). Use for: meditation and breath work and other practices; ongoing pain/discomfort such as stomach pain, knee/joint pain, shoulder pain, wrist pain, back pain, muscle soreness, or muscle stiffness (category "symptom", value = 0-10 severity if given, NOT minutes); brain/mental clarity (category "other", value = 0-10, high = clearer, NOT minutes); body measurements like weight; and light/named activities (kite surfing, dancing, stretching, biking, walking, swimming). One entry per occurrence — EXCEPT when the user describes a repeated/recurring habit over a span ("meditated every morning for three weeks", "walked Mon/Wed/Fri last month"): emit ONE entry with a recurrence (start_date + end_date, plus weekdays if only some days), not one entry per day. The app expands the recurrence into individual dated rows.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO YYYY-MM-DD for a single occurrence. Omit when using recurrence or dates.' },
            recurrence: {
              type: 'object',
              description: 'For a habit repeated over a span. The app creates one dated row per matching day in the range.',
              properties: {
                start_date: { type: 'string', description: 'ISO YYYY-MM-DD, first day of the span' },
                end_date: { type: 'string', description: 'ISO YYYY-MM-DD, last day of the span (inclusive)' },
                weekdays: {
                  type: 'array',
                  description: 'Only these weekdays within the span (e.g. ["mon","wed","fri"]). Omit for every day in the span.',
                  items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
                },
              },
              required: ['start_date', 'end_date'],
            },
            dates: {
              type: 'array',
              description: 'Explicit list of ISO YYYY-MM-DD dates for irregular repeats that are not a clean range. Alternative to recurrence.',
              items: { type: 'string' },
            },
            name: { type: 'string', description: "short lowercase label, e.g. 'meditation', 'breath work', 'knee pain', 'stomach pain', 'weight', 'kite surfing'" },
            category: { type: 'string', enum: ['practice', 'symptom', 'measurement', 'activity', 'release', 'other'] },
            value: { type: 'number', description: 'numeric value if any: minutes for practices/activities, 0-10 severity for symptoms, the number for measurements' },
            unit: { type: 'string', description: "'min', '/10', 'kg', 'lb', etc." },
            time: { type: 'string', description: "HH:MM 24h time of day, only if the user mentioned a specific time (e.g. '7am meditation' -> '07:00'). Omit if not mentioned." },
            notes: { type: 'string', description: "Any identifying detail the user gave — named method, technique, teacher, or app (e.g. 'Joe Dispenza', '9D breathwork', 'box breathing', 'Wim Hof'; for pain, what it felt like or what preceded it)." },
          },
        },
      },
      follow_up_questions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Targeted questions for important missing details the user did not cover (e.g. recovery time, what preceded a gut/infection episode, energy/mood if absent). Empty if nothing important is missing.',
      },
    },
    required: ['summary', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'tracks', 'follow_up_questions'],
  },
} as const

export const MEAL_TOOL = {
  name: 'record_meal_nutrition',
  description: 'Estimate the nutrition of a meal from a photo and/or a written description. Give best-estimate macros and ask clarifying questions when portion sizes or hidden ingredients (oil, sauces) are uncertain.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name of the dish' },
      meal_type: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Infer from context/time of day if the user did not say it explicitly.',
      },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'string', description: 'estimated amount, e.g. "150 g", "1 cup cooked"' },
          },
          required: ['name', 'quantity'],
        },
      },
      calories: { type: 'number' },
      protein_g: { type: 'number' },
      fat_g: { type: 'number' },
      carbs_g: { type: 'number' },
      fiber_g: { type: 'number' },
      food_groups: foodGroups,
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      clarifying_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Questions to confirm portions or hidden ingredients. Empty if confident.',
      },
    },
    required: ['name', 'meal_type', 'ingredients', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'food_groups', 'confidence', 'clarifying_questions'],
  },
} as const

export const MULTI_MEAL_TOOL = {
  name: 'record_meals',
  description:
    'Split a dictated description covering more than one meal (and possibly more than one day) into separate meal records, each with its own best-estimate macros.',
  input_schema: {
    type: 'object',
    properties: {
      meals: {
        type: 'array',
        description: 'One entry per distinct meal mentioned, in the order eaten.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO YYYY-MM-DD this meal was eaten on.' },
            meal_time: { type: 'string', description: "HH:MM 24h estimate from context (breakfast ~08:00, lunch ~13:00, dinner ~19:00, snack ~16:00) unless the user gave an explicit time." },
            meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'The eating-occasion keyword that identified this as a separate meal, or inferred from meal_time.' },
            name: { type: 'string', description: 'Short name of the dish' },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'string', description: 'estimated amount, e.g. "150 g", "1 cup cooked"' },
                },
                required: ['name', 'quantity'],
              },
            },
            calories: { type: 'number' },
            protein_g: { type: 'number' },
            fat_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fiber_g: { type: 'number' },
            food_groups: foodGroups,
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['date', 'meal_time', 'meal_type', 'name', 'ingredients', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'food_groups', 'confidence'],
        },
      },
    },
    required: ['meals'],
  },
} as const

// Same shape as `foodGroups` above, described for a single ingredient rather than
// a whole meal. Kept as its own constant rather than reusing `foodGroups` — that
// one's wording is tuned for MEAL_TOOL/MULTI_MEAL_TOOL, which are shipped and
// live; a single ingredient is described differently ("almost always 1 in exactly
// one bucket") and the two should be free to diverge.
const foodGroupsForFood = {
  type: 'object',
  description:
    'What fraction of THIS ONE food comes from each source. Should sum to roughly 1, and for a single ingredient is almost always 1 in exactly one bucket (an egg is dairy_eggs: 1; olive oil, oats and lentils are vegan: 1). Split only for a genuinely mixed food like a filled pastry.',
  properties: {
    vegan: { type: 'number', description: '0-1' },
    dairy_eggs: { type: 'number', description: '0-1' },
    meat_beef: { type: 'number', description: '0-1' },
    meat_chicken: { type: 'number', description: '0-1' },
    meat_fish: { type: 'number', description: '0-1, includes other seafood' },
    meat_other: { type: 'number', description: '0-1, pork/lamb/duck/etc.' },
  },
  required: ['vegan', 'dairy_eggs', 'meat_beef', 'meat_chicken', 'meat_fish', 'meat_other'],
}

// Used once per brand-new ingredient in the tap-to-build meal builder (lib/
// mealBuild.ts, ai/anthropic.ts's describeFoods) — the result is stored in the
// `foods` table and reused forever after, unlike MEAL_TOOL/MULTI_MEAL_TOOL which
// are called on every single meal. Array-shaped so "one new ingredient" and
// "fill in the N the backfill left macro-less" are the same call.
export const FOOD_TOOL = {
  name: 'record_food_profiles',
  description:
    'Give the per-100g nutrition profile and a sensible default serving for each named ingredient, so the app can compute meal macros locally from grams without calling you again.',
  input_schema: {
    type: 'object',
    properties: {
      foods: {
        type: 'array',
        description: 'One entry per name requested, in the same order. Never omit or merge entries, even if two names are near-duplicates.',
        items: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The name exactly as given, echoed back verbatim so the app can match this entry to its request.' },
            name: { type: 'string', description: 'Cleaned canonical name, e.g. "rolled oats", "avocado", "chicken breast". Lowercase unless a brand or proper noun. Singular.' },
            brand: { type: 'string', description: 'Brand, only if one was named. Omit for generic foods.' },
            state: {
              type: 'string',
              enum: ['raw', 'cooked', 'dry', 'as_sold'],
              description: 'Which state the per-100g numbers below refer to — the state a person would actually put on a scale. Rice and pasta "dry" unless told otherwise; meat and fish "raw"; vegetables and fruit "raw"; bread, oil, yoghurt "as_sold".',
            },
            kcal_100g: { type: 'number', description: 'Calories per 100g in that state.' },
            protein_100g: { type: 'number', description: 'Grams of protein per 100g.' },
            fat_100g: { type: 'number', description: 'Grams of total fat per 100g.' },
            carbs_100g: { type: 'number', description: 'Grams of total carbohydrate per 100g, INCLUDING fibre.' },
            fiber_100g: { type: 'number', description: 'Grams of dietary fibre per 100g.' },
            serving_g: { type: 'number', description: 'Grams in ONE natural serving — what a person means by "one" of the thing, or one sensible portion for foods with no natural unit. A whole avocado ~140, one egg ~55, one slice of bread ~35, one tablespoon of olive oil ~14, a portion of rolled oats ~50, a portion of dry rice ~75.' },
            serving_label: { type: 'string', description: 'How that single serving reads in the UI: "1 avocado", "1 egg", "1 slice", "1 tbsp", "1 portion". Singular, leading "1" only, no macro values.' },
            food_groups: foodGroupsForFood,
            confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How well-established these reference values are. A generic whole food is "high"; an unbranded composite dish is "low".' },
            note: { type: 'string', description: 'One short line ONLY if something is genuinely ambiguous, e.g. "assumed dry weight". Omit otherwise.' },
          },
          required: ['query', 'name', 'state', 'kcal_100g', 'protein_100g', 'fat_100g', 'carbs_100g', 'fiber_100g', 'serving_g', 'serving_label', 'food_groups', 'confidence'],
        },
      },
    },
    required: ['foods'],
  },
} as const

export const INTERPRET_TOOL = {
  name: 'record_interpretation',
  description: 'Record observed patterns and correlations across the health data.',
  input_schema: {
    type: 'object',
    properties: {
      patterns: { type: 'string', description: 'Bullet-style observed patterns (markdown allowed).' },
      correlations: { type: 'string', description: 'Specific correlations, e.g. stress load vs gut/infection timing (markdown allowed).' },
      period_covered: { type: 'string', description: 'e.g. "last 30 days"' },
    },
    required: ['patterns', 'correlations', 'period_covered'],
  },
} as const

// JSON schemas used as Anthropic "tools" to force structured output.

const precededBy = {
  type: 'array',
  items: { type: 'string', enum: ['travel', 'ceremony', 'work_project', 'online_work', 'transition', 'other'] },
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
          'Generic trackable items to graph over time that are NOT exercise-with-soreness bouts (those go in activities). Use for: meditation and breath work and other practices; ongoing pain/discomfort such as stomach pain, knee/joint pain, shoulder pain, wrist pain, or back pain (category "symptom", value = 0-10 severity if given); body measurements like weight; and light/named activities (kite surfing, dancing, stretching, biking, walking, swimming). One entry per occurrence — EXCEPT when the user describes a repeated/recurring habit over a span ("meditated every morning for three weeks", "walked Mon/Wed/Fri last month"): emit ONE entry with a recurrence (start_date + end_date, plus weekdays if only some days), not one entry per day. The app expands the recurrence into individual dated rows.',
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
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      clarifying_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Questions to confirm portions or hidden ingredients. Empty if confident.',
      },
    },
    required: ['name', 'ingredients', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'confidence', 'clarifying_questions'],
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
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['date', 'meal_time', 'name', 'ingredients', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'confidence'],
        },
      },
    },
    required: ['meals'],
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

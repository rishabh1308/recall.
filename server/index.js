import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

function questionCountFor(notes) {
  const wordCount = notes.match(/\S+/g)?.length ?? 0;
  return Math.min(50, Math.max(5, Math.ceil(wordCount / 30)));
}

const studySetSchema = {
  name: 'study_set',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'flashcards', 'quiz'],
    properties: {
      title: { type: 'string' },
      flashcards: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['heading', 'points'],
          properties: {
            heading: { type: 'string' },
            points: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string' }
            }
          }
        }
      },
      quiz: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'options', 'correctIndex', 'explanation'],
          properties: {
            question: { type: 'string' },
            options: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: { type: 'string' }
            },
            correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
            explanation: { type: 'string' }
          }
        }
      }
    }
  }
};

export async function generateStudySet(req, res) {
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (notes.length < 20) {
    return res
      .status(400)
      .json({ error: 'Please enter at least 20 characters of notes.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: 'OPENAI_API_KEY is missing. Add it to your .env file.' });
  }

  const questionCount = questionCountFor(notes);
  const responseSchema = structuredClone(studySetSchema);
  responseSchema.schema.properties.quiz.minItems = questionCount;
  responseSchema.schema.properties.quiz.maxItems = questionCount;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(60000, questionCount * 4000)
  );

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: Math.min(12000, 1000 + questionCount * 140),
        response_format: { type: 'json_schema', json_schema: responseSchema },
        messages: [
          {
            role: 'system',
            content: `You are a precise study coach. Create exactly ${questionCount} quiz questions—one for roughly every 30 words in the supplied notes, with a minimum of 5 and maximum of 50. Make every quiz question answerable only from the supplied notes, cover distinct important details, and do not invent facts. Keep questions, options, and explanations concise to make large study sets fast to generate. Make flashcards as quick-revision notes, not questions: each needs a short statement-style heading and 2–4 concise, high-value fact bullets. Headings and bullets must be direct revision points, never questions, prompts, or answers.`
          },
          {
            role: 'user',
            content: `Create a study set from these notes:\n\n${notes}`
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: data.error?.message || 'The AI request failed.' });
    }

    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') {
      return res
        .status(502)
        .json({ error: 'The AI returned an empty response. Please retry.' });
    }

    res.json({ raw });
  } catch (error) {
    const message =
      error.name === 'AbortError'
        ? 'The request took too long. Please retry.'
        : 'Could not reach the AI service. Check your connection and retry.';

    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/generate', generateStudySet);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(3001, () => {
    console.log('API server listening on http://localhost:3001');
  });
}

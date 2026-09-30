import Groq from 'groq-sdk'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// The single source of truth for the Groq model. Set GROQ_MODEL to override.
// The previously hardcoded model id does not exist on Groq and made every call
// fail with 404 model_not_found.
const MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'

// Support multiple Groq keys — rotate to the next one when the current key is
// unusable. GROQ_API_KEY is the primary; GROQ_API_KEY_2.._N are fallbacks.
// Unset/blank vars are dropped here so they can never be sent as a
// "Bearer undefined" token.
const groqKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4
].filter((k) => typeof k === 'string' && k.trim() && k.trim().toLowerCase() !== 'undefined')

const clients = groqKeys.map((apiKey) => new Groq({ apiKey }))
let keyIndex = 0

// Never log key material — only the 1-based position of the key in use.
function keyLabel(i) {
  return `key #${i + 1}`
}

function errorStatus(err) {
  return err?.status || err?.statusCode || err?.response?.status || undefined
}

function errorCode(err) {
  return err?.error?.code || err?.code || undefined
}

function errorType(err) {
  return String(err?.error?.type || err?.type || '')
}

// Only credential/quota/transport failures are worth spending another key on.
// A 404 model_not_found or a 400 invalid_request_error fails identically on
// every key, so rotating there just burns the whole pool for nothing.
function shouldRotate(err) {
  const status = errorStatus(err)
  if (status === 429) return true
  if (status === 401 || status === 403) return true
  if (status >= 500) return true
  if (status === 404 || status === 400 || status === 422) return false
  if (status) return false
  // No HTTP status at all: treat as a network/transport fault.
  const code = errorCode(err) || ''
  const msg = String(err?.message || '')
  return (
    /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(msg) ||
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_SOCKET'].includes(code)
  )
}

// Message for the fatal (non-rotating) failures, with an actionable hint.
function describeFatal(err) {
  const status = errorStatus(err)
  const code = errorCode(err)
  const detail = String(err?.error?.message || err?.message || 'unknown error')
  if (status === 404 || /model_not_found/i.test(code || detail)) {
    return `Groq model_not_found (404) for model "${MODEL}". Set GROQ_MODEL in server/.env to a model your Groq account can access (default: qwen/qwen3.8-27b).`
  }
  if (status === 400 || /invalid_request_error/i.test(errorType(err))) {
    return `Groq rejected the request (400 invalid_request_error) on model "${MODEL}": ${detail}`
  }
  if (status === 401 || status === 403) {
    return `Groq auth error (${status}): ${detail}`
  }
  return `Groq request failed (${status || 'no status'}): ${detail}`
}

// Single shared call site for every helper in this module. Each configured key
// is tried at most once; there is no unbounded retry loop.
async function createWithRotation(params) {
  if (!clients.length) {
    throw new Error('No Groq API keys configured — set GROQ_API_KEY (optionally _2/_3/_4) in server/.env')
  }

  let lastErr = null
  for (let attempt = 0; attempt < clients.length; attempt++) {
    try {
      return await clients[keyIndex % clients.length].chat.completions.create(params)
    } catch (err) {
      lastErr = err
      if (!shouldRotate(err)) {
        throw new Error(describeFatal(err))
      }
      keyIndex = (keyIndex + 1) % clients.length
      console.warn(
        `Groq ${errorStatus(err) || 'network'} error — rotating to ${keyLabel(keyIndex)} of ${clients.length}`
      )
    }
  }
  throw new Error(
    `All ${clients.length} Groq API key(s) failed (${describeFatal(lastErr)})`
  )
}

// qwen3.8-27b is a reasoning model: the trace may come back in a dedicated
// field rather than inside `content`. Prefer `content`, and fall back to the
// reasoning field so only text that actually exists is ever parsed/stripped.
function messageContent(res) {
  const msg = res?.choices?.[0]?.message || {}
  const content = typeof msg.content === 'string' ? msg.content.trim() : ''
  if (content) return content
  const reasoning = msg.reasoning_content || msg.reasoning || ''
  return typeof reasoning === 'string' ? reasoning : ''
}

// Strip the model's <think> reasoning block (including unclosed ones),
// markdown code fences, then extract the first valid JSON object from the reply
// Remove any <thinking>...</thinking> reasoning spans plus a dangling unclosed
// opening tag, so both plain-text and JSON replies never expose the trace.
function stripThinking(raw) {
  let text = String(raw || '')
  // Remove complete <think>...</think> / <thinking>...</thinking> blocks.
  text = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
  // Cut at any unclosed opening tag (handles truncated responses).
  const open = text.match(/<think(?:ing)?>/gi)
  if (open) text = text.slice(0, text.indexOf(open[0]))
  // Remove any leftover standalone tag remnants.
  text = text.replace(/<\/?think(?:ing)?>/gi, '')
  // Cut at bare "Thinking:"/"thought process" preambles with no angle brackets.
  const cutMatch = text.match(/^thinking\b/gi)
  if (cutMatch) {
    const nl = text.indexOf('\n')
    text = nl >= 0 ? text.slice(nl + 1).trim() : ''
  }
  return text.trim()
}

function extractJson(raw) {
  let text = stripThinking(raw)
  const closeIdx = text.toLowerCase().lastIndexOf('</think>')
  if (closeIdx !== -1) text = text.slice(closeIdx + 8).trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    // Scan every '{' from the end of the text backwards, and try to parse the
    // JSON object starting there. The last '{' that yields a valid object is
    // the real payload — reasoning text contains stray braces but never forms
    // a complete valid JSON object by itself.
    for (let start = text.length - 1; start >= 0; start--) {
      if (text[start] !== '{') continue
      let depth = 0
      let inString = false
      let escaped = false
      for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(start, i + 1))
            } catch {
              break
            }
          }
        }
      }
    }
    throw new Error('AI returned invalid JSON — could not parse response')
  }
}

// Remove the model's thinking/reasoning trace from plain-text replies so
// users only ever see the final answer. Reasoning models may emit a
// <thinking>...</thinking> span, or a bare "thinking" / "Here's a thinking
// process:" preamble, or a dangling unclosed tag — handle all of them.
function stripReasoning(raw) {
  let text = stripThinking(raw)

  // Cut everything from a bare "thinking" preamble (no angle brackets)
  // up to the end — anything before that marker is discarded reasoning.
  const cutMatch = text.match(/^thinking\b/gi)
  if (cutMatch) {
    const nl = text.indexOf('\n')
    text = nl >= 0 ? text.slice(nl + 1).trim() : ''
  }

  // Guard against a stray "Here's a thinking process:" header
  if (/^here's? a thinking (process|chain)[:\-]?/i.test(text)) {
    const lines = text.split(/\r?\n/)
    const firstReal = lines.findIndex((l) => !/^(here's? a thinking|#{0,3}\s)/i.test(l.trim()))
    if (firstReal > 0) text = lines.slice(firstReal).join('\n')
  }

  return text.replace(/\s*\n{3,}/g, '\n\n').trim()
}

// Startup diagnostics: report configuration health without ever revealing a
// key value. Safe to call from the server bootstrap.
export function logAiConfig() {
  const count = clients.length
  if (!count) {
    console.warn('[ai] WARNING: no Groq API keys configured — AI features will fail. Set GROQ_API_KEY (optionally GROQ_API_KEY_2..4) in server/.env')
  } else {
    console.log(`[ai] Groq ready: ${count} key(s) configured, active model "${MODEL}"`)
  }
}

export async function summariseNotes(rawText) {
  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `Analyse these study notes. Return JSON only, no markdown, no backticks:
{
  "subject": "detected subject e.g. Chemistry",
  "summary": "2-3 sentence summary",
  "topics": ["up to 8 topic strings"],
  "keyPoints": ["up to 10 key point strings"]
}

Detect the subject freely from the content.
Return the most precise academic subject name possible.
Do not limit to any predefined list.
Examples: Organic Chemistry, Cell Biology,
Constitutional Law, Financial Accounting,
Trigonometry, Nigerian History, Literature in English.
Be specific.

Notes:
${rawText}`
    }],
    temperature: 0.3,
    reasoning_effort: 'none',
    max_tokens: 2048
  })
  return extractJson(messageContent(res))
}

export async function generateQuiz(summary, topics, count = 10, difficulty = 'medium') {
  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `Generate exactly ${count} WAEC/JAMB level MCQ questions from this content.
Return JSON only, no markdown, no backticks:
{
  "questions": [
    {
      "question": "full question text",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correct": 0,
      "explanation": "why this answer is correct",
      "topic": "which topic this tests"
    }
  ]
}

Rules:
- exactly 4 options per question
- correct is the index 0-3 of the right answer
- explanations must be educational and concise
- difficulty level: WAEC/JAMB Nigerian exam standard

Difficulty level: ${difficulty}
- easy: basic recall, definitions, simple facts
- medium: application and understanding  
- hard: analysis, evaluation, complex scenarios

Summary: ${summary}
Topics: ${topics.join(', ')}`
    }],
    temperature: 0.5,
    reasoning_effort: 'none',
    max_tokens: 3000
  })
  const result = extractJson(messageContent(res))
  // qwen sometimes returns a bare question object/array instead of the wrapper
  if (Array.isArray(result)) return { questions: result }
  if (result && !Array.isArray(result.questions)) {
    return { questions: [result] }
  }
  return result
}

export async function explainConcept(concept, subject) {
  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `You are StudyMate, Studiq's academic tutor. You answer ONLY academic
study questions. Do NOT engage with greetings, chit-chat, or off-topic requests.

If the user asks about anything that is not an academic concept (for example
"hello", a casual question, or a non-study topic), reply exactly:
"I am your AI study companion and I can only answer academic study questions."

Otherwise explain "${concept}" from ${subject} in very simple language a
secondary school student can understand. Use one everyday analogy.
Keep it under 150 words.

Rules:
- Think silently. NEVER show any <thinking>, chain-of-thought, or reasoning.
- Return the final answer only, as plain text, no JSON, no markdown.`
    }],
    temperature: 0.3,
    reasoning_effort: 'none',
    max_tokens: 4000
  })
  return stripReasoning(messageContent(res))
}

export async function generateFlashcards(keyPoints, subject) {
  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `Create flashcards from these key points. 
Return JSON only:
{
  "flashcards": [
    { "front": "question or term", "back": "answer or definition" }
  ]
}
Key points: ${keyPoints.join(', ')}
Subject: ${subject}`
    }],
    temperature: 0.3,
    reasoning_effort: 'none',
    max_tokens: 2000
  })
  const result = extractJson(messageContent(res))
  // qwen sometimes returns a bare flashcard array/object instead of the wrapper
  if (Array.isArray(result)) return { flashcards: result }
  if (result && !Array.isArray(result.flashcards)) {
    return { flashcards: [result] }
  }
  return result
}

export async function generateFeedback(question, correctAnswer, userAnswer, explanation) {
  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `A student answered a quiz question wrong.
Question: ${question}
Correct answer: ${correctAnswer}
Student answered: ${userAnswer}
Standard explanation: ${explanation}

Write encouraging, personalised feedback in 2-3 sentences 
that explains WHY they got it wrong and HOW to remember 
the correct answer. Use simple language. Plain text only.

Rules:
- Think silently. NEVER show any <thinking>, chain-of-thought, or reasoning.
- Return the final answer only, no JSON, no markdown.`
    }],
    temperature: 0.4,
    reasoning_effort: 'none',
    max_tokens: 4000
  })
  return stripReasoning(messageContent(res))
}

export async function generateStudyPlan(weakTopics, subjects, daysAvailable, mode = 'all', selectedSubject = '', customTopic = '') {
  let prompt = '';

  if (mode === 'subject' && selectedSubject) {
    prompt = `Create a ${daysAvailable}-day personalised study plan for a student preparing for WAEC/JAMB.
Focus entirely on: ${selectedSubject}
Weak topics in this subject: ${weakTopics.filter((_, i) => subjects[i] === selectedSubject || subjects.includes(selectedSubject)).join(', ') || weakTopics.join(', ')}
Return JSON only:
{
  "plan": [
    {
      "day": 1,
      "date": "Monday",
      "sessions": [
        {
          "subject": "${selectedSubject}",
          "topic": "Topic name",
          "duration": "45 mins",
          "activity": "Review notes + take quiz"
        }
      ]
    }
  ]
}

Rules:
- All sessions must be for ${selectedSubject}
- Focus on weak topics first, then strengthen good areas
- Vary activities: review, quiz, flashcards, past questions
- Keep sessions 30-60 mins
- Include rest days if ${daysAvailable} >= 7`;
  } else if (mode === 'topic' && customTopic) {
    prompt = `Create a ${daysAvailable}-day personalised study plan for a student preparing for WAEC/JAMB.
Focus entirely on this topic: ${customTopic}
The student wants to master this specific area.
Return JSON only:
{
  "plan": [
    {
      "day": 1,
      "date": "Monday",
      "sessions": [
        {
          "subject": "${customTopic}",
          "topic": "Subtopic or skill",
          "duration": "45 mins",
          "activity": "Study + practice"
        }
      ]
    }
  ]
}

Rules:
- All sessions must relate to ${customTopic}
- Progress from basics to advanced
- Include varied activities: reading, practice, self-test
- Sessions 30-60 mins
- Build understanding progressively over ${daysAvailable} days`;
  } else if (mode === 'ai') {
    prompt = `Create a ${daysAvailable}-day personalised study plan for a student preparing for WAEC/JAMB.
Based on the student's performance data, pick the most urgent subjects and topics that need attention.

Subjects and scores: ${subjects.map((s, i) => `${s} (${weakTopics[i] || 'needs focus'})`).join(', ')}

Return JSON only:
{
  "plan": [
    {
      "day": 1,
      "date": "Monday",
      "sessions": [
        {
          "subject": "Subject name",
          "topic": "Urgent topic",
          "duration": "45 mins",
          "activity": "Targeted review + quiz"
        }
      ]
    }
  ]
}

Rules:
- Prioritise subjects/topics with lowest scores or least recent activity
- If one subject is clearly weakest, spend more days on it
- Mix subjects if multiple need attention
- Sessions 30-60 mins
- Balance focused practice with review`;
  } else {
    prompt = `Create a ${daysAvailable}-day personalised study plan for a student preparing for WAEC/JAMB.
Cover all subjects, prioritising weak areas first.

All subjects: ${subjects.join(', ') || 'General studies'}
Weak topics: ${weakTopics.join(', ') || 'General review'}

Return JSON only:
{
  "plan": [
    {
      "day": 1,
      "date": "Monday",
      "sessions": [
        {
          "subject": "Subject name",
          "topic": "Topic name",
          "duration": "45 mins",
          "activity": "Review notes + take quiz"
        }
      ]
    }
  ]
}

Rules:
- Cover all subjects across the ${daysAvailable} days
- Prioritise weak topics first
- Rotate subjects to avoid burnout
- Sessions 30-60 mins
- Include varied activities: review, quiz, flashcards, practice`;
  }

  const res = await createWithRotation({
    model: MODEL,
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: 0.4,
    reasoning_effort: 'none',
    max_tokens: 2000
  })
  const result = extractJson(messageContent(res))
  if (result && !Array.isArray(result.plan)) {
    if (Array.isArray(result)) return { plan: result }
    return { plan: [result] }
  }
  return result
}

// Ask Studiq AI an open academic question, grounded in the student's history
// (subjects, recent topics, and quiz performance) when available.
export async function askStudiqAI(question, context) {
  const res = await createWithRotation({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are Studiq AI — an expert academic 
tutor for Nigerian secondary school and university students.

Your personality:
- Smart, encouraging and clear
- You explain concepts at the right level
- You use Nigerian context and examples where helpful
- You never just give answers — you teach understanding
- For maths/science: show step-by-step working
- For essays/humanities: structure your answer clearly
- You reference the student's study history when provided

Student study context:
${context || 'No prior study history available yet.'}

Rules:
- Answer in clear simple English
- Use analogies and real-life examples
- For complex topics: break into numbered steps
- End every answer with a quick tip or memory trick
- Never write assignments for students — teach instead
- Think silently. NEVER show any <thinking>, chain-of-thought, or reasoning.
- Return the final answer only, as plain text, no JSON, no markdown.`
      },
      {
        role: 'user',
        content: question
      }
    ],
    temperature: 0.6,
    reasoning_effort: 'none',
    max_tokens: 1024
  })
  return stripReasoning(messageContent(res)).trim()
}

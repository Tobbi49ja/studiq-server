// Lightweight text vectorization and similarity search
// Uses TF-IDF-like approach without external dependencies

import { estimateTokens } from './chunking.js';

// Common English stop words to ignore
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
  'hers', 'herself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  's', 't', 'just', 'don', 'now', 'also', 'if', 'then', 'about', 'up',
  'out', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'once', 'here', 'there', 'any',
  'being', 'having', 'doing', 'get', 'got', 'make', 'made', 'take', 'taken',
  'come', 'came', 'go', 'went', 'see', 'seen', 'know', 'known', 'think',
  'say', 'said', 'tell', 'told', 'give', 'given', 'find', 'found', 'want',
  'wanted', 'use', 'used', 'work', 'worked', 'call', 'called', 'try', 'tried',
  'ask', 'asked', 'seem', 'seemed', 'feel', 'felt', 'leave', 'left', 'put',
  'keep', 'kept', 'let', 'begin', 'began', 'show', 'showed', 'hear', 'heard',
  'play', 'played', 'run', 'ran', 'move', 'moved', 'live', 'lived', 'believe',
  'believed', 'bring', 'brought', 'happen', 'happened', 'write', 'wrote',
  'provide', 'provided', 'sit', 'sat', 'stand', 'stood', 'lose', 'lost',
  'pay', 'paid', 'meet', 'met', 'include', 'included', 'continue', 'continued',
  'set', 'learn', 'learned', 'change', 'changed', 'lead', 'led', 'understand',
  'understood', 'watch', 'watched', 'follow', 'followed', 'stop', 'stopped',
  'create', 'created', 'speak', 'spoke', 'read', 'allow', 'allowed', 'add',
  'added', 'spend', 'spent', 'grow', 'grew', 'open', 'opened', 'walk', 'walked',
  'win', 'won', 'offer', 'offered', 'remember', 'remembered', 'love', 'loved',
  'consider', 'considered', 'appear', 'appeared', 'buy', 'bought', 'wait',
  'waited', 'serve', 'served', 'die', 'died', 'send', 'sent', 'expect',
  'expected', 'build', 'built', 'stay', 'stayed', 'fall', 'fell', 'cut',
  'reach', 'reached', 'kill', 'killed', 'remain', 'remained', 'suggest',
  'suggested', 'raise', 'raised', 'pass', 'passed', 'sell', 'sold', 'require',
  'required', 'report', 'reported', 'decide', 'decided', 'pull', 'pulled',
  'develop', 'developed', 'among', 'point', 'number', 'part', 'thing', 'place',
  'case', 'week', 'company', 'system', 'program', 'question', 'government',
  'night', 'point', 'home', 'water', 'room', 'mother', 'area', 'money',
  'story', 'fact', 'month', 'lot', 'right', 'study', 'book', 'eye', 'job',
  'word', 'business', 'issue', 'side', 'kind', 'head', 'house', 'service',
  'friend', 'father', 'power', 'hour', 'game', 'line', 'end', 'member',
  'law', 'car', 'city', 'community', 'name', 'president', 'team', 'minute',
  'idea', 'kid', 'body', 'information', 'back', 'parent', 'face', 'others',
  'level', 'office', 'door', 'health', 'person', 'art', 'war', 'history',
  'party', 'result', 'morning', 'reason', 'research', 'girl', 'guy', 'moment',
  'air', 'teacher', 'force', 'education'
]);

/**
 * Tokenize text into words
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Calculate term frequency for a document
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function termFrequency(text) {
  const tokens = tokenize(text);
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by total tokens
  const total = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Calculate cosine similarity between two texts
 * @param {string} textA
 * @param {string} textB
 * @returns {number} Similarity score 0-1
 */
export function cosineSimilarity(textA, textB) {
  const tfA = termFrequency(textA);
  const tfB = termFrequency(textB);

  const allTerms = new Set([...tfA.keys(), ...tfB.keys()]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const a = tfA.get(term) || 0;
    const b = tfB.get(term) || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the most relevant chunks for a query
 * @param {string} query - User query
 * @param {string[]} chunks - Array of text chunks
 * @param {number} topK - Number of top chunks to return
 * @returns {{ text: string, score: number, index: number }[]}
 */
export function findRelevantChunks(query, chunks, topK = 3) {
  const scores = chunks.map((chunk, index) => ({
    text: chunk,
    score: cosineSimilarity(query, chunk),
    index
  }));

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Build a context string from relevant chunks
 * @param {string} query
 * @param {string[]} chunks
 * @param {number} maxTokens - Max tokens for context
 * @param {number} topK
 * @returns {string}
 */
export function buildContextFromChunks(query, chunks, maxTokens = 2000, topK = 3) {
  const relevant = findRelevantChunks(query, chunks, topK);
  let context = '';
  
  for (const chunk of relevant) {
    const candidate = context ? `${context}\n\n---\n\n${chunk.text}` : chunk.text;
    if (estimateTokens(candidate) > maxTokens) break;
    context = candidate;
  }

  return context;
}

/**
 * Extract key terms from text for indexing
 * @param {string} text
 * @param {number} topN
 * @returns {string[]}
 */
export function extractKeyTerms(text, topN = 20) {
  const tf = termFrequency(text);
  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}

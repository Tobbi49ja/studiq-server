// Chunking utility for document processing
// Splits large text into overlapping chunks for LLM processing

const DEFAULT_CHUNK_SIZE = 1000; // characters per chunk
const DEFAULT_OVERLAP = 200; // overlap between chunks

/**
 * Split text into overlapping chunks
 * @param {string} text - The text to chunk
 * @param {number} chunkSize - Max characters per chunk
 * @param {number} overlap - Overlap between chunks
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP) {
  if (!text || text.length <= chunkSize) {
    return text ? [text] : [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at a sentence boundary
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('. ', end);
      if (sentenceEnd > start + chunkSize * 0.5) {
        end = sentenceEnd + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Split text into chunks at paragraph boundaries
 * @param {string} text - The text to chunk
 * @param {number} maxChars - Max characters per chunk
 * @returns {string[]} Array of text chunks
 */
export function chunkByParagraph(text, maxChars = DEFAULT_CHUNK_SIZE) {
  if (!text || text.length <= maxChars) {
    return text ? [text] : [];
  }

  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += (currentChunk ? '\n\n' : '') + para;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 chars)
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Truncate text to max tokens
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
export function truncateToTokens(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

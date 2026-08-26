import { askStudiqAI } from '../utils/ai.js';
import Performance from '../models/Performance.js';
import Note from '../models/Note.js';
import { findRelevantChunks } from '../utils/vector.js';

// POST /api/ask — answer an open question using RAG (Retrieval-Augmented Generation)
export async function askAI(req, res, next) {
  try {
    const { question, noteId } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Build context from student history
    const recentPerf = await Performance.find({
      userId: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('noteId', 'subject topics');

    const recentNotes = await Note.find({
      userId: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('subject topics summary chunks');

    const subjects = [...new Set(recentNotes.map((n) => n.subject).filter(Boolean))];
    const topics = [...new Set(recentNotes.flatMap((n) => n.topics || []))].slice(0, 10);
    const scores = recentPerf
      .filter((p) => p.totalQuestions > 0 && p.subject)
      .map((p) => `${p.subject} ${Math.round((p.totalScore / p.totalQuestions) * 100)}%`);

    // RAG: Find relevant chunks from notes
    let relevantContext = '';
    let sources = [];

    if (noteId) {
      // If asking about a specific note, search within that note's chunks
      const note = await Note.findOne({ _id: noteId, userId: req.user.id }).select('chunks title subject');
      if (note && note.chunks?.length) {
        const chunkTexts = note.chunks.map(c => c.text);
        const relevant = findRelevantChunks(question, chunkTexts, 3);
        relevantContext = relevant.map(r => r.text).join('\n\n');
        sources = [`${note.subject} — ${note.title}`];
      }
    } else {
      // Search across all notes' chunks
      const allChunks = [];
      const chunkToNote = [];
      
      for (const note of recentNotes) {
        if (note.chunks?.length) {
          for (const chunk of note.chunks) {
            allChunks.push(chunk.text);
            chunkToNote.push({ subject: note.subject, title: note.title });
          }
        }
      }

      if (allChunks.length) {
        const relevant = findRelevantChunks(question, allChunks, 4);
        relevantContext = relevant.map(r => r.text).join('\n\n');
        sources = [...new Set(relevant.map(r => `${chunkToNote[r.index]?.subject} — ${chunkToNote[r.index]?.title}`))];
      }
    }

    // Build the final context for LLM
    const context = `
${relevantContext ? `Relevant study material:\n${relevantContext}\n\n` : ''}Student study profile:
- Subjects studied: ${subjects.join(', ') || 'None yet'}
- Recent topics: ${topics.join(', ') || 'None yet'}
- Recent quiz scores: ${scores.join(', ') || 'No quizzes taken yet'}
${sources.length ? `- Source: ${sources.join(', ')}` : ''}
    `.trim();

    const answer = await askStudiqAI(question.trim(), context);
    res.json({ data: { answer } });
  } catch (err) {
    next(err);
  }
}

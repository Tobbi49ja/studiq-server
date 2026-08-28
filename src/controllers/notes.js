import pdfParse from 'pdf-parse';
import Note from '../models/Note.js';
import Quiz from '../models/Quiz.js';
import Performance from '../models/Performance.js';
import { summariseNotes, generateQuiz, explainConcept, generateFlashcards } from '../utils/ai.js';
import { audit } from '../utils/audit.js';
import { chunkText, estimateTokens } from '../utils/chunking.js';
import { extractKeyTerms } from '../utils/vector.js';

// POST /api/notes/upload — auth + multer middleware applied in router
export async function uploadNote(req, res, next) {
  try {
    let rawText = '';
    let title = '';

    if (req.file) {
      const ext = (req.file.originalname.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
      if (ext === 'pdf') {
        const parsed = await pdfParse(req.file.buffer);
        rawText = parsed.text;
      } else {
        rawText = req.file.buffer.toString('utf8');
      }
      title = req.file.originalname.replace(/\.[^.]+$/, '');
    }

    if (req.body.pastedText && req.body.pastedText.trim()) {
      rawText = req.body.pastedText.trim();
      title = title || (req.body.title || 'Pasted Notes');
    }

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: 'No content provided — upload a file or paste text' });
    }

    // Cap input length to protect token usage (max ~40k chars = ~10k tokens)
    const MAX_CHARS = 40000;
    const text = rawText.slice(0, MAX_CHARS);

    // Process document in chunks if large
    const chunks = chunkText(text, 2000, 200);
    const chunkData = chunks.map((chunk, index) => ({
      text: chunk,
      index,
      keyTerms: extractKeyTerms(chunk, 10)
    }));

    // For summarization, use first few chunks or full text if small
    const summaryText = text.length <= 8000 ? text : chunks.slice(0, 4).join('\n\n');
    const ai = await summariseNotes(summaryText);
    const detectedSubject = ai.subject || 'General';

    // Subject verification: compare user-selected subject with AI-detected
    const userSelectedSubject = req.body.subject?.trim() || '';
    let finalSubject = detectedSubject;
    let subjectMismatch = false;

    if (userSelectedSubject) {
      if (userSelectedSubject.toLowerCase() === detectedSubject.toLowerCase()) {
        // Exact match — use student's selected subject
        finalSubject = userSelectedSubject;
      } else {
        // Mismatch — AI overrides with detected subject
        finalSubject = detectedSubject;
        subjectMismatch = true;
      }
    }

    const note = await Note.create({
      userId: req.user.id,
      title: title || 'Untitled Notes',
      rawText: text,
      summary: ai.summary || '',
      topics: Array.isArray(ai.topics) ? ai.topics : [],
      keyPoints: Array.isArray(ai.keyPoints) ? ai.keyPoints : [],
      subject: finalSubject,
      chunks: chunkData,
      totalChunks: chunks.length
    });

    await audit(req, 'note.upload', `${note.subject} — ${note.title}`);

    let quiz = null;
    try {
      // Pick difficulty from the user's average score
      const records = await Performance.find({ userId: req.user.id }).select('totalScore totalQuestions');
      const totalQ = records.reduce((a, r) => a + r.totalQuestions, 0);
      const totalS = records.reduce((a, r) => a + r.totalScore, 0);
      const avgScore = totalQ > 0 ? (totalS / totalQ) * 100 : null;

      let difficulty = 'medium';
      if (avgScore !== null) {
        if (avgScore < 50) difficulty = 'easy';
        else if (avgScore >= 75) difficulty = 'hard';
      }

      // Generate quiz from summary + topics (not full text)
      const generated = await generateQuiz(note.summary, note.topics, 10, difficulty);
      const questions = Array.isArray(generated.questions) ? generated.questions : [];
      quiz = await Quiz.create({
        noteId: note._id,
        userId: req.user.id,
        questions: questions.map((q) => ({
          question: q.question || '',
          options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
          correct: typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3 ? q.correct : 0,
          explanation: q.explanation || '',
          topic: q.topic || ''
        }))
      });
    } catch (quizErr) {
      console.error('Quiz generation failed:', quizErr.message);
      quiz = null;
    }

    res.status(201).json({
      data: {
        note: {
          _id: note._id,
          title: note.title,
          subject: note.subject,
          topics: note.topics,
          summary: note.summary
        },
        subjectVerification: userSelectedSubject ? {
          selected: userSelectedSubject,
          detected: detectedSubject,
          mismatch: subjectMismatch
        } : null,
        quiz: quiz
          ? { _id: quiz._id, questions: quiz.questions }
          : null
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/notes — all notes for the user
export async function listNotes(req, res, next) {
  try {
    const notes = await Note.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('_id title subject topics createdAt');
    res.json({ data: notes });
  } catch (err) {
    next(err);
  }
}

// POST /api/notes/explain — explain a concept in simple terms
export async function explainNote(req, res, next) {
  try {
    const { concept, subject } = req.body;
    if (!concept || !concept.trim()) {
      return res.status(400).json({ error: 'concept is required' });
    }
    const explanation = await explainConcept(concept.trim(), (subject || 'General').trim());
    res.json({ data: { explanation } });
  } catch (err) {
    next(err);
  }
}

// GET /api/notes/:noteId/flashcards — generate flashcards for a note
export async function getFlashcards(req, res, next) {
  try {
    const note = await Note.findOne({ _id: req.params.noteId, userId: req.user.id }).select('_id keyPoints subject topics');
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const keyPoints = note.keyPoints?.length ? note.keyPoints : (note.topics || []);
    if (!keyPoints.length) {
      return res.status(404).json({ error: 'This note has no key points to study' });
    }

    const generated = await generateFlashcards(keyPoints, note.subject || 'General');
    const flashcards = Array.isArray(generated.flashcards) ? generated.flashcards : [];
    if (!flashcards.length) {
      return res.status(502).json({ error: 'Flashcard generation failed' });
    }

    res.json({
      data: {
        noteId: note._id,
        subject: note.subject || 'General',
        flashcards: flashcards.map((f) => ({
          front: f.front || '',
          back: f.back || ''
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

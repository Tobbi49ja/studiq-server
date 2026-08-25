import Quiz from '../models/Quiz.js';
import Note from '../models/Note.js';
import { generateFeedback } from '../utils/ai.js';

// GET /api/quiz — list the user's quizzes with note titles/subjects
export async function listQuizzes(req, res, next) {
  try {
    const quizzes = await Quiz.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id noteId questions createdAt');

    const noteIds = [...new Set(quizzes.map((q) => q.noteId?.toString()).filter(Boolean))];
    const notes = await Note.find({ _id: { $in: noteIds } }).select('_id title subject');

    const noteMap = new Map(notes.map((n) => [n._id.toString(), n]));

    const data = quizzes.map((q) => {
      const note = q.noteId ? noteMap.get(q.noteId.toString()) : null;
      return {
        _id: q._id,
        noteId: q.noteId,
        title: note?.title || 'Untitled Notes',
        subject: note?.subject || 'General',
        questionCount: q.questions?.length || 0,
        createdAt: q.createdAt
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// GET /api/quiz/:quizId — full quiz, must belong to user
export async function getQuiz(req, res, next) {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.quizId, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json({ data: quiz });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    next(err);
  }
}

// POST /api/quiz/feedback — personalised AI feedback for a wrong answer
export async function postFeedback(req, res, next) {
  try {
    const { question, correctAnswer, userAnswer, explanation } = req.body;
    if (!question || !correctAnswer || !userAnswer) {
      return res.status(400).json({ error: 'question, correctAnswer and userAnswer are required' });
    }

    const feedback = await generateFeedback(
      String(question),
      String(correctAnswer),
      String(userAnswer),
      String(explanation || '')
    );

    res.json({ data: { feedback } });
  } catch (err) {
    next(err);
  }
}

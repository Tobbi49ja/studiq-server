import { askStudiqAI } from '../utils/ai.js';
import Performance from '../models/Performance.js';
import Note from '../models/Note.js';

// POST /api/ask — answer an open question using the student's study history
export async function askAI(req, res, next) {
  try {
    const { question } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Build smart context from student history
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
      .select('subject topics summary');

    const subjects = [...new Set(recentNotes.map((n) => n.subject).filter(Boolean))];
    const topics = [...new Set(recentNotes.flatMap((n) => n.topics || []))].slice(0, 10);
    const scores = recentPerf
      .filter((p) => p.totalQuestions > 0 && p.subject)
      .map((p) => `${p.subject} ${Math.round((p.totalScore / p.totalQuestions) * 100)}%`);

    const context = `
Subjects studied: ${subjects.join(', ') || 'None yet'}
Recent topics: ${topics.join(', ') || 'None yet'}
Recent quiz scores: ${scores.join(', ') || 'No quizzes taken yet'}
    `.trim();

    const answer = await askStudiqAI(question.trim(), context);
    res.json({ data: { answer } });
  } catch (err) {
    next(err);
  }
}

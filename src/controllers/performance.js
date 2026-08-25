import Performance from '../models/Performance.js';
import Quiz from '../models/Quiz.js';
import Note from '../models/Note.js';
import { generateStudyPlan } from '../utils/ai.js';

// POST /api/performance — grade answers, save record
export async function submitPerformance(req, res, next) {
  try {
    const { quizId, noteId, subject, answers, timeTakenSeconds } = req.body;
    console.log(`[Studiq perf] POST /performance user=${req.user.id} quizId=${quizId} answers=${JSON.stringify(answers)}`);

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'quizId and answers[] are required' });
    }

    const quiz = await Quiz.findOne({ _id: quizId, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Grade
    const questions = quiz.questions;
    let correctCount = 0;
    const topicMap = new Map();

    questions.forEach((q, i) => {
      const chosen = answers[i];
      const isCorrect = typeof chosen === 'number' && chosen === q.correct;
      if (isCorrect) correctCount += 1;

      const topic = q.topic || 'General';
      if (!topicMap.has(topic)) topicMap.set(topic, { topic, correct: 0, total: 0 });
      const entry = topicMap.get(topic);
      entry.total += 1;
      if (isCorrect) entry.correct += 1;
    });

    const total = questions.length;
    const topicScores = [...topicMap.values()];

    const perf = await Performance.create({
      userId: req.user.id,
      quizId,
      noteId: noteId || null,
      subject: subject || '',
      topicScores,
      totalScore: correctCount,
      totalQuestions: total,
      timeTakenSeconds: timeTakenSeconds || 0
    });

    res.status(201).json({
      data: {
        _id: perf._id,
        score: correctCount,
        total,
        topicScores,
        correct: correctCount,
        wrong: total - correctCount
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/performance/summary — aggregate by subject
export async function getSummary(req, res, next) {
  try {
    const records = await Performance.find({ userId: req.user.id }).select(
      'subject topicScores totalScore totalQuestions'
    );

    const subjectMap = new Map();

    for (const rec of records) {
      const subject = rec.subject || 'General';
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { subject, totalScore: 0, totalQuestions: 0, quizCount: 0, topicAgg: new Map() });
      }
      const s = subjectMap.get(subject);
      s.totalScore += rec.totalScore;
      s.totalQuestions += rec.totalQuestions;
      s.quizCount += 1;

      for (const ts of rec.topicScores) {
        const topic = ts.topic || 'General';
        if (!s.topicAgg.has(topic)) s.topicAgg.set(topic, { topic, correct: 0, total: 0 });
        const t = s.topicAgg.get(topic);
        t.correct += ts.correct;
        t.total += ts.total;
      }
    }

    const data = [...subjectMap.values()].map((s) => {
      const avgScore = s.totalQuestions > 0 ? Math.round((s.totalScore / s.totalQuestions) * 100) : 0;
      const weakTopics = [...s.topicAgg.values()]
        .filter((t) => t.total > 0)
        .map((t) => ({ topic: t.topic, avgScore: Math.round((t.correct / t.total) * 100) }))
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 3);
      return {
        subject: s.subject,
        avgScore,
        quizCount: s.quizCount,
        totalQuestions: s.totalQuestions,
        totalScore: s.totalScore,
        weakTopics
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// GET /api/performance/history — last 20 records with note title
export async function getHistory(req, res, next) {
  try {
    const records = await Performance.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('totalScore totalQuestions subject timeTakenSeconds createdAt noteId');

    const noteIds = [...new Set(records.map((r) => r.noteId?.toString()).filter(Boolean))];
    const notes = await Note.find({ _id: { $in: noteIds } }).select('_id title');

    const noteTitle = new Map(notes.map((n) => [n._id.toString(), n.title]));

    const data = records.map((r) => ({
      _id: r._id,
      score: r.totalScore,
      total: r.totalQuestions,
      subject: r.subject,
      timeTakenSeconds: r.timeTakenSeconds,
      createdAt: r.createdAt,
      noteTitle: r.noteId ? noteTitle.get(r.noteId.toString()) || 'Untitled' : null
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// POST /api/performance/studyplan — personalised study plan from weak topics
export async function generatePlan(req, res, next) {
  try {
    const daysAvailable = Math.min(Math.max(parseInt(req.body.daysAvailable, 10) || 7, 1), 30);

    const records = await Performance.find({ userId: req.user.id }).select('subject topicScores totalScore totalQuestions');
    const subjectMap = new Map();

    for (const rec of records) {
      const subject = rec.subject || 'General';
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { subject, totalScore: 0, totalQuestions: 0, topicAgg: new Map() });
      }
      const s = subjectMap.get(subject);
      s.totalScore += rec.totalScore;
      s.totalQuestions += rec.totalQuestions;
      for (const ts of rec.topicScores) {
        const topic = ts.topic || 'General';
        if (!s.topicAgg.has(topic)) s.topicAgg.set(topic, { topic, correct: 0, total: 0 });
        const t = s.topicAgg.get(topic);
        t.correct += ts.correct;
        t.total += ts.total;
      }
    }

    const weakTopics = [];
    const subjects = [];
    for (const s of subjectMap.values()) {
      const topics = [...s.topicAgg.values()]
        .filter((t) => t.total > 0)
        .map((t) => ({ topic: t.topic, score: t.correct / t.total }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);
      if (topics.length) {
        subjects.push(s.subject);
        weakTopics.push(...topics.map((t) => t.topic));
      }
    }

    if (!weakTopics.length) {
      return res.status(400).json({ error: 'No quiz history yet — take a quiz first so Studiq can build your study plan' });
    }

    const generated = await generateStudyPlan(weakTopics.slice(0, 12), subjects, daysAvailable);
    const plan = Array.isArray(generated.plan) ? generated.plan : [];

    res.json({
      data: {
        daysAvailable,
        weakTopics,
        subjects,
        plan
      }
    });
  } catch (err) {
    next(err);
  }
}

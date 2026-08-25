import User from '../models/User.js';
import Note from '../models/Note.js';
import Quiz from '../models/Quiz.js';
import Performance from '../models/Performance.js';

// GET /api/admin/stats — platform-wide aggregate numbers
export async function getStats(req, res, next) {
  try {
    const [totalUsers, totalNotes, totalQuizzes, totalPerformances, recentUsers] = await Promise.all([
      User.countDocuments(),
      Note.countDocuments(),
      Quiz.countDocuments(),
      Performance.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt role')
    ]);

    res.json({
      data: {
        totalUsers,
        totalNotes,
        totalQuizzes,
        totalPerformances,
        recentUsers
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users — all users with their study data counts
export async function listUsers(req, res, next) {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('name email role subjects createdAt');

    const usersWithCounts = await Promise.all(
      users.map(async (u) => {
        const [notes, quizzes] = await Promise.all([
          Note.countDocuments({ userId: u._id }),
          Quiz.countDocuments({ userId: u._id })
        ]);
        return {
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          subjects: u.subjects || [],
          notes,
          quizzes,
          createdAt: u.createdAt
        };
      })
    );

    res.json({ data: usersWithCounts });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/role — promote/demote (student <-> admin)
export async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!['student', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "student" or "admin"' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = role;
    await user.save();
    res.json({ data: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/users/:id — remove a user and their study data
export async function deleteUser(req, res, next) {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await Promise.allSettled([
      Note.deleteMany({ userId: user._id }),
      Quiz.deleteMany({ userId: user._id }),
      Performance.deleteMany({ userId: user._id })
    ]);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/notes — every note across all users
export async function listNotes(req, res, next) {
  try {
    const notes = await Note.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId', 'name email')
      .select('title subject topics summary createdAt');

    res.json({
      data: notes.map((n) => ({
        id: n._id,
        title: n.title,
        subject: n.subject,
        topics: n.topics || [],
        summary: n.summary,
        user: n.userId ? { id: n.userId._id, name: n.userId.name, email: n.userId.email } : null,
        createdAt: n.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/notes/:id — remove a specific note
export async function deleteNote(req, res, next) {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    await Quiz.deleteMany({ noteId: note._id });
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

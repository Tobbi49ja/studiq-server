import User from '../models/User.js';
import { audit } from '../utils/audit.js';

// GET /api/subjects — list the user's saved subjects
export async function getSubjects(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('subjects');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user.subjects });
  } catch (err) {
    next(err);
  }
}

// POST /api/subjects/add — add a subject to the user's profile (deduped)
export async function addSubject(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }
    if (name.length > 80) {
      return res.status(400).json({ error: 'Subject name must be 80 characters or fewer' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { subjects: name } },
      { new: true, runValidators: true }
    ).select('subjects');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await audit(req, 'subject.add', name);
    res.status(201).json({ data: user.subjects });
  } catch (err) {
    next(err);
  }
}
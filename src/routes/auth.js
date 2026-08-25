import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import Note from '../models/Note.js';
import Quiz from '../models/Quiz.js';
import Performance from '../models/Performance.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'studiq_secret_2026';

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, subjects: user.subjects || [] };
}

// GET /api/auth/me — current profile (view)
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('name email subjects');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/me — update profile (name/email, optional password)
router.put(
  '/me',
  auth,
  [
    body('name').optional().trim().isLength({ max: 80 }).withMessage('Name must be 80 characters or fewer'),
    body('email').optional().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').optional().isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { name, email, password } = req.body;

      if (email !== undefined && email.toLowerCase() !== user.email.toLowerCase()) {
        const existing = await User.findOne({ email });
        if (existing) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        user.email = email;
      }

      if (name !== undefined && name.trim()) {
        user.name = name.trim();
      }

      if (password) {
        user.passwordHash = await bcrypt.hash(password, 10);
      }

      await user.save();
      res.json({ data: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/auth/me — delete the account
router.delete('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Best-effort cleanup of the user's study data
    await Promise.allSettled([
      Note.deleteMany({ userId: req.user.id }),
      Quiz.deleteMany({ userId: req.user.id }),
      Performance.deleteMany({ userId: req.user.id })
    ]);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { name, email, password } = req.body;
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({ name, email, passwordHash });

      const token = signToken(user);
      res.status(201).json({ data: { token, user: publicUser(user) } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = signToken(user);
      res.json({ data: { token, user: publicUser(user) } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

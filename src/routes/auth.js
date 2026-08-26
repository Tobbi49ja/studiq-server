import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import Note from '../models/Note.js';
import Quiz from '../models/Quiz.js';
import Performance from '../models/Performance.js';
import { auth } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

// Minimal Google ID-token verification using the public JWKS from Google.
// We avoid a heavy SDK: fetch keys, verify with jsonwebtoken, check iss/aud.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let googleKeysCache = null;
let googleKeysFetchedAt = 0;
const GOOGLE_KEYS_TTL = 60 * 60 * 1000; // 1 hour

async function getGoogleKeys() {
  const now = Date.now();
  if (googleKeysCache && now - googleKeysFetchedAt < GOOGLE_KEYS_TTL) {
    return googleKeysCache;
  }
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch Google keys');
  const jwks = await res.json();
  googleKeysCache = jwks.keys;
  googleKeysFetchedAt = now;
  return googleKeysCache;
}

async function verifyGoogleCredential(credential) {
  const keys = await getGoogleKeys();
  const header = JSON.parse(Buffer.from(credential.split('.')[0], 'base64url').toString());
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error('Google key not found');

  const payload = jwt.verify(credential, key, {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com']
  });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (clientId && payload.aud !== clientId) {
    throw new Error('Google token audience mismatch');
  }
  return payload;
}

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'studiq_secret_2026';

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, subjects: user.subjects || [] };
}

// POST /api/auth/google — sign in/up with a Google ID token
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    const payload = await verifyGoogleCredential(credential);
    const email = (payload.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: payload.name || email.split('@')[0],
        email,
        passwordHash: '', // Google users have no password
        subjects: []
      });
      await audit(req, 'auth.google_register', email);
    } else {
      await audit(req, 'auth.google_login', email);
    }

    const token = signToken(user);
    res.json({ data: { token, user: publicUser(user) } });
  } catch (err) {
    console.error('Google auth failed:', err.message);
    res.status(401).json({ error: 'Google sign-in failed: ' + err.message });
  }
});

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
    await audit(req, 'account.delete', user.email);
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
      await audit(req, 'auth.register', email);
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
      await audit(req, 'auth.login', email);
      res.json({ data: { token, user: publicUser(user) } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

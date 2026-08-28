import { Router } from 'express';
import Message from '../models/Message.js';
import { audit } from '../utils/audit.js';

const router = Router();

// POST /api/contact — submit a contact form
router.post('/', async (req, res, next) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const msg = await Message.create({ name, email, message });
    await audit(req, 'contact.submit', `${name} (${email})`);
    res.status(201).json({ data: { id: msg._id, success: true } });
  } catch (err) {
    next(err);
  }
});

export default router;

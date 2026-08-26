import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { askAI } from '../controllers/ask.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.use(auth);
router.use(rateLimit);

router.post('/', askAI);

export default router;

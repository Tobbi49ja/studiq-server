import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { askAI } from '../controllers/ask.js';

const router = Router();

router.use(auth);

router.post('/', askAI);

export default router;

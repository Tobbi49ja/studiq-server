import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { submitPerformance, getSummary, getHistory, generatePlan } from '../controllers/performance.js';

const router = Router();

router.use(auth);

router.post('/', submitPerformance);
router.post('/studyplan', generatePlan);
router.get('/summary', getSummary);
router.get('/history', getHistory);

export default router;

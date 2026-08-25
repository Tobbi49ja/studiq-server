import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { listQuizzes, getQuiz, postFeedback } from '../controllers/quiz.js';

const router = Router();

router.use(auth);

router.get('/', listQuizzes);
router.get('/:quizId', getQuiz);
router.post('/feedback', postFeedback);

export default router;

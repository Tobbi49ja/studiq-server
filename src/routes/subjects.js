import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { getSubjects, addSubject } from '../controllers/subjects.js';

const router = Router();

router.use(auth);

router.get('/', getSubjects);
router.post('/add', addSubject);

export default router;
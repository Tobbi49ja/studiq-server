import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadNote, listNotes, explainNote, getFlashcards } from '../controllers/notes.js';
import { rateLimit, checkInputSize } from '../middleware/rateLimit.js';

const router = Router();

router.use(auth);
router.use(rateLimit);

router.post('/upload', checkInputSize, upload, uploadNote);
router.get('/', listNotes);
router.post('/explain', explainNote);
router.get('/:noteId/flashcards', getFlashcards);

export default router;

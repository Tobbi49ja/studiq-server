import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.js';
import { getStats, listUsers, updateUserRole, deleteUser, listNotes, deleteNote, listAudit } from '../controllers/admin.js';

const router = Router();

router.use(auth, adminOnly);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/notes', listNotes);
router.delete('/notes/:id', deleteNote);
router.get('/audit', listAudit);

export default router;

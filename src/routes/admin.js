import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth.js';
import { getStats, listUsers, updateUserRole, deleteUser, listNotes, deleteNote, listAudit } from '../controllers/admin.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.use(auth, adminOnly);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/notes', listNotes);
router.delete('/notes/:id', deleteNote);
router.get('/audit', listAudit);

// Settings management
router.get('/settings', async (req, res, next) => {
  try {
    const Setting = (await import('../models/Setting.js')).default;
    const settings = await Setting.find().select('key value updatedAt');
    const result = {};
    settings.forEach((s) => { result[s.key] = s.value; });
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.put('/settings/:key', async (req, res, next) => {
  try {
    const Setting = (await import('../models/Setting.js')).default;
    const doc = await Setting.set(req.params.key, req.body.value);
    await audit(req, 'admin.settings_update', `${req.params.key} = ${req.body.value}`);
    res.json({ data: { key: doc.key, value: doc.value } });
  } catch (err) { next(err); }
});

// Contact messages
router.get('/messages', async (req, res, next) => {
  try {
    const Message = (await import('../models/Message.js')).default;
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json({ data: messages });
  } catch (err) { next(err); }
});

router.patch('/messages/:id/read', async (req, res, next) => {
  try {
    const Message = (await import('../models/Message.js')).default;
    const msg = await Message.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    res.json({ data: msg });
  } catch (err) { next(err); }
});

router.delete('/messages/:id', async (req, res, next) => {
  try {
    const Message = (await import('../models/Message.js')).default;
    await Message.findByIdAndDelete(req.params.id);
    await audit(req, 'admin.delete_message', req.params.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
});

export default router;

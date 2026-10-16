import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '100kb' }));
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY;
const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'points.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ students: {} }, null, 2));
function load() {
  try { const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if (!d.students) d.students = {}; return d; }
  catch { return { students: {} }; }
}
function save(d) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function adminOnly(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_KEY غير مضبوط في إعدادات الخادم' });
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'مفتاح المسؤول غير صحيح' });
  next();
}
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'iraq-points-backend' }));
app.get('/api/students/:studentId/points', (req, res) => {
  const id = String(req.params.studentId || '').trim();
  if (!id) return res.status(400).json({ error: 'studentId مطلوب' });
  const d = load();
  res.set('Cache-Control', 'no-store');
  res.json({ studentId: id, points: Number(d.students[id]?.points || 0) });
});
app.post('/api/admin/students/points', adminOnly, (req, res) => {
  const id = String(req.body?.studentId || '').trim();
  const amount = Number(req.body?.points);
  if (!id) return res.status(400).json({ error: 'studentId مطلوب' });
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return res.status(400).json({ error: 'عدد النقاط غير صالح' });
  const d = load();
  const student = d.students[id] || { points: 0, updatedAt: null };
  student.points = Number(student.points || 0) + amount;
  student.updatedAt = new Date().toISOString();
  d.students[id] = student;
  save(d);
  res.json({ success: true, studentId: id, added: amount, balance: student.points, message: `تم حفظ ${amount} نقطة. الرصيد الجديد: ${student.points}` });
});
app.use((_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));
app.listen(PORT, '0.0.0.0', () => console.log(`Points backend listening on ${PORT}; data file: ${DATA_FILE}`));

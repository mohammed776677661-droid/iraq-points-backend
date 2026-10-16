import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '100kb' }));
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

function adminOnly(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_KEY غير مضبوط في إعدادات الخادم' });
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'مفتاح المسؤول غير صحيح' });
  next();
}
const clean = v => String(v ?? '').trim().slice(0, 160);

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    student_id TEXT PRIMARY KEY, points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS access_codes (
    id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 3650),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), used_at TIMESTAMPTZ,
    used_by TEXT, expires_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY, referrer_id TEXT NOT NULL,
    referred_student_id TEXT NOT NULL UNIQUE, points_awarded INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (referrer_id <> referred_student_id)
  )`);
}
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'iraq-points-backend', database: 'connected' }); }
  catch (e) { console.error(e.message); res.status(503).json({ ok: false, database: 'unavailable' }); }
});
app.get('/api/students/:studentId/points', async (req, res) => {
  try {
    const r = await pool.query('SELECT points FROM students WHERE student_id=$1', [clean(req.params.studentId)]);
    res.set('Cache-Control','no-store');
    res.json({ studentId: clean(req.params.studentId), points: Number(r.rows[0]?.points || 0) });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'تعذر قراءة النقاط' }); }
});
app.post('/api/admin/students/points', adminOnly, async (req, res) => {
  const id=clean(req.body?.studentId), amount=Number(req.body?.points);
  if (!id) return res.status(400).json({ error:'studentId مطلوب' });
  if (!Number.isSafeInteger(amount)||amount<1||amount>1000000) return res.status(400).json({ error:'عدد النقاط غير صالح' });
  try {
    const r=await pool.query(`INSERT INTO students(student_id,points) VALUES($1,$2)
      ON CONFLICT(student_id) DO UPDATE SET points=students.points+EXCLUDED.points,updated_at=NOW()
      RETURNING points`,[id,amount]);
    res.json({success:true,studentId:id,added:amount,balance:Number(r.rows[0].points)});
  } catch(e) { console.error(e.message); res.status(500).json({error:'تعذر حفظ النقاط'}); }
});
// POST /api/admin/access-codes ; header x-admin-key ; body { days: 30 }
app.post('/api/admin/access-codes', adminOnly, async (req,res) => {
  const days=Number(req.body?.days);
  if (!Number.isSafeInteger(days)||days<1||days>3650) return res.status(400).json({error:'مدة الكود يجب أن تكون من 1 إلى 3650 يوماً'});
  try {
    for(let i=0;i<4;i++) {
      const code=crypto.randomBytes(6).toString('hex').toUpperCase();
      try {
        const r=await pool.query('INSERT INTO access_codes(code,days) VALUES($1,$2) RETURNING code,days,created_at',[code,days]);
        return res.status(201).json({success:true,code:r.rows[0].code,days:r.rows[0].days,createdAt:r.rows[0].created_at});
      } catch(e) { if(e.code!=='23505') throw e; }
    }
    res.status(500).json({error:'تعذر إنشاء كود فريد'});
  } catch(e) { console.error('Generate code:',e.message); res.status(500).json({error:'تعذر إنشاء الكود في قاعدة البيانات'}); }
});
// Atomic one-time redemption; the same code cannot be redeemed by two requests.
app.post('/api/access-codes/verify', async (req,res) => {
  const code=String(req.body?.code??'').trim().toUpperCase(), studentId=clean(req.body?.studentId);
  if(!code||!studentId) return res.status(400).json({success:false,error:'code و studentId مطلوبان'});
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const r=await c.query('SELECT id,code,days,used_at FROM access_codes WHERE code=$1 FOR UPDATE',[code]);
    if(!r.rowCount){await c.query('ROLLBACK');return res.status(404).json({success:false,error:'الكود غير موجود'});}
    if(r.rows[0].used_at){await c.query('ROLLBACK');return res.status(409).json({success:false,error:'هذا الكود مستخدم مسبقاً'});}
    const expiresAt=new Date(Date.now()+Number(r.rows[0].days)*86400000);
    await c.query('UPDATE access_codes SET used_at=NOW(),used_by=$1,expires_at=$2 WHERE id=$3',[studentId,expiresAt,r.rows[0].id]);
    await c.query('COMMIT');
    res.json({success:true,code,studentId,days:Number(r.rows[0].days),expiresAt:expiresAt.toISOString()});
  } catch(e) { await c.query('ROLLBACK').catch(()=>{}); console.error(e.message); res.status(500).json({success:false,error:'تعذر التحقق من الكود'}); }
  finally { c.release(); }
});
app.post('/api/referrals/claim', async (req,res) => {
  const referrerId=clean(req.body?.referrerId), studentId=clean(req.body?.studentId);
  if(!referrerId||!studentId) return res.status(400).json({success:false,error:'referrerId و studentId مطلوبان'});
  if(referrerId===studentId) return res.status(400).json({success:false,error:'لا يمكن دعوة نفسك'});
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const claim=await c.query('INSERT INTO referrals(referrer_id,referred_student_id) VALUES($1,$2) ON CONFLICT(referred_student_id) DO NOTHING RETURNING id',[referrerId,studentId]);
    if(!claim.rowCount){await c.query('ROLLBACK');return res.status(409).json({success:false,error:'تم تسجيل دعوة هذا الطالب مسبقاً'});}
    const b=await c.query(`INSERT INTO students(student_id,points) VALUES($1,10)
      ON CONFLICT(student_id) DO UPDATE SET points=students.points+10,updated_at=NOW() RETURNING points`,[referrerId]);
    await c.query('COMMIT');
    const count=await c.query('SELECT COUNT(*)::int AS total FROM referrals WHERE referrer_id=$1',[referrerId]);
    res.status(201).json({success:true,referrerId,studentId,awardedPoints:10,balance:Number(b.rows[0].points),studentPoints:Number(b.rows[0].points),referralCount:Number(count.rows[0].total)});
  } catch(e) { await c.query('ROLLBACK').catch(()=>{}); console.error(e.message); res.status(500).json({success:false,error:'تعذر تسجيل الدعوة'}); }
  finally { c.release(); }
});
app.get('/api/referrals/:studentId/stats', async (req,res) => {
  try {
    const r=await pool.query('SELECT COUNT(*)::int AS total FROM referrals WHERE referrer_id=$1',[clean(req.params.studentId)]);
    const total=Number(r.rows[0].total);
    res.set('Cache-Control','no-store'); res.json({studentId:clean(req.params.studentId),referrals:total,referralCount:total,pointsEarned:total*10});
  } catch(e) { console.error(e.message); res.status(500).json({error:'تعذر قراءة الإحصائيات'}); }
});
app.get('/api/referrals/:studentId/students', async (req,res) => {
  try {
    const r=await pool.query(
      'SELECT referred_student_id, created_at FROM referrals WHERE referrer_id=$1 ORDER BY created_at DESC',
      [clean(req.params.studentId)]
    );
    res.set('Cache-Control','no-store');
    res.json({studentId:clean(req.params.studentId),students:r.rows.map(x=>({studentId:x.referred_student_id,createdAt:x.created_at}))});
  } catch(e) { console.error(e.message); res.status(500).json({error:'تعذر قراءة قائمة الطلاب المدعوين'}); }
});
app.use((_req,res)=>res.status(404).json({error:'المسار غير موجود'}));
initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('Backend listening; PostgreSQL connected')))
.catch(e=>{console.error('Database initialization failed:',e.message);process.exit(1);});
process.on('SIGTERM',async()=>{await pool.end().catch(()=>{});process.exit(0);});

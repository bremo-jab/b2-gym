/**
 * server/index.js — Express API Server (PostgreSQL)
 * ---------------------------------------------------
 */
require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'B2Gym_S3cur3_JWT_S3cr3t_K3y_2026!';
const JWT_EXPIRES_IN = '12h';

// Middleware
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// JWT Auth Helpers
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, member_id: user.member_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

const requireRole = (roles) => async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح — الرجاء تسجيل الدخول أولاً' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!roles.includes(decoded.role)) {
      return res.status(403).json({ error: 'صلاحيات غير كافية للوصول إلى هذه الخدمة' });
    }
    const user = await db.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'الحساب غير موجود أو تم حذفه' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة — الرجاء تسجيل الدخول مجدداً', expired: true });
    }
    return res.status(401).json({ error: 'رمز المصادقة غير صالح' });
  }
};

// UTC Date Helper
function getUTCDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// ── AUTHENTICATION ────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { phone, member_id: access_code } = req.body;
  if (!phone || !access_code) {
    return res.status(400).json({ error: 'الرجاء إدخال رقم الهاتف ورمز الدخول' });
  }

  // First try to authenticate with password (for admin/receptionist)
  let user = await db.getUserByPhoneAndPassword(phone, access_code);
  
  // If that fails, try member_id (for members)
  if (!user) {
    user = await db.getUserByPhoneAndMemberId(phone, access_code.trim().toUpperCase());
  }
  
  if (!user) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة، يرجى المراجعة أو التواصل مع الاستقبال' });
  }

  let subscription = null;
  if (user.role === 'member') {
    subscription = await db.getSubscriptionByUserId(user.id);
  }

  const token = signToken(user);

  res.json({ token, user, subscription });
});

app.get('/api/auth/me', requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const subscription = req.user.role === 'member'
    ? await db.getSubscriptionByUserId(req.user.id)
    : null;
  res.json({ user: req.user, subscription });
});

// ── SUBSCRIPTION PLANS ────────────────────────────────────────────────────────

app.get('/api/plans', async (req, res) => {
  res.json(await db.getAllSubscriptionPlans());
});

app.post('/api/plans', requireRole(['admin']), async (req, res) => {
  const { name, price, duration_days, sessions_count } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'الرجاء تعبئة الحقول المطلوبة لباقة الاشتراك' });
  }
  const plan = await db.createSubscriptionPlan({ name, price, duration_days, sessions_count });
  res.status(201).json(plan);
});

app.put('/api/plans/:id', requireRole(['admin']), async (req, res) => {
  const updated = await db.updateSubscriptionPlan(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'الباقة غير موجودة' });
  res.json(updated);
});

app.delete('/api/plans/:id', requireRole(['admin']), async (req, res) => {
  try {
    await db.deleteSubscriptionPlan(req.params.id);
    res.json({ message: 'تم حذف الباقة بنجاح' });
  } catch {
    res.status(404).json({ error: 'الباقة غير موجودة' });
  }
});

// ── MEMBERS MANAGEMENT ────────────────────────────────────────────────────────

app.get('/api/users', requireRole(['admin', 'receptionist']), async (req, res) => {
  const users = await db.getAllUsers();
  const memberships = await db.getAllActiveMemberships();
  const joined = users.map(user => ({
    ...user,
    subscription: memberships.find(s => s.user_id === user.id) || null
  }));
  res.json(joined);
});

app.post('/api/users', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { name, phone, role, member_id, plan_id, start_date } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'الرجاء إدخال الاسم ورقم الهاتف' });
  }

  const newUser = await db.createUser({ name, phone, role, member_id });

  if (newUser.role === 'member' && plan_id) {
    const plan = await db.getSubscriptionPlanById(plan_id);
    if (plan) {
      const sDate = start_date || getUTCDateString();
      const eDate = new Date(sDate + 'T00:00:00Z');
      eDate.setUTCDate(eDate.getUTCDate() + plan.duration_days);
      await db.createMembership({
        user_id: newUser.id, plan_id: plan.id, status: 'active',
        start_date: sDate, end_date: getUTCDateString(eDate),
        sessions_remaining: plan.sessions_count || null
      });
    }
  }

  const sub = await db.getSubscriptionByUserId(newUser.id);
  res.status(201).json({ ...newUser, subscription: sub || null });
});

app.put('/api/users/:id', requireRole(['admin', 'receptionist']), async (req, res) => {
  const updatedUser = await db.updateUser(req.params.id, req.body);
  if (!updatedUser) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const { plan_id, start_date, subscription_status } = req.body;

  if (plan_id) {
    const plan = await db.getSubscriptionPlanById(plan_id);
    if (plan) {
      const sDate = start_date || getUTCDateString();
      const eDate = new Date(sDate + 'T00:00:00Z');
      eDate.setUTCDate(eDate.getUTCDate() + plan.duration_days);
      const currentSub = await db.getSubscriptionByUserId(updatedUser.id);
      if (currentSub) {
        await db.updateMembership(currentSub.id, {
          status: subscription_status || 'active',
          start_date: sDate, end_date: getUTCDateString(eDate),
          sessions_remaining: plan.sessions_count || null
        });
      } else {
        await db.createMembership({
          user_id: updatedUser.id, plan_id: plan.id,
          status: subscription_status || 'active',
          start_date: sDate, end_date: getUTCDateString(eDate),
          sessions_remaining: plan.sessions_count || null
        });
      }
    }
  } else if (subscription_status) {
    const currentSub = await db.getSubscriptionByUserId(updatedUser.id);
    if (currentSub) {
      await db.updateMembership(currentSub.id, { status: subscription_status });
    }
  }

  const sub = await db.getSubscriptionByUserId(updatedUser.id);
  res.json({ ...updatedUser, subscription: sub || null });
});

app.delete('/api/users/:id', requireRole(['admin', 'receptionist']), async (req, res) => {
  try {
    await db.deleteUser(req.params.id);
    res.json({ message: 'تم حذف المشترك وكافة بياناته بنجاح' });
  } catch {
    res.status(404).json({ error: 'المستخدم غير موجود' });
  }
});

// ── QR CHECK-IN ───────────────────────────────────────────────────────────────

app.post('/api/checkin', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'الرمز غير صحيح أو مفقود' });

  const users = await db.getAllUsers();
  const user = users.find(u => u.member_id === member_id.trim().toUpperCase());
  if (!user) {
    return res.status(404).json({ error: 'عفواً، لم يتم العثور على أي مشترك بهذا الرمز' });
  }

  if (user.role !== 'member') {
    return res.status(400).json({ error: 'هذا الرمز لا يخص مشتركاً في النادي' });
  }

  const sub = await db.getSubscriptionByUserId(user.id);

  if (!sub) {
    return res.json({
      status: 'error', user,
      message: `تم رفض الدخول! لا يوجد اشتراك مسجل للاعب [${user.name}]. يرجى الاشتراك في الباقات.`
    });
  }

  const todayUTC = getUTCDateString();
  const isExpiredByDate = sub.end_date && sub.end_date < todayUTC;
  const isExpiredBySessions = sub.sessions_remaining !== null && sub.sessions_remaining <= 0;
  const isExpired = sub.status === 'expired' || isExpiredByDate || isExpiredBySessions;

  if (isExpired) {
    if (sub.status !== 'expired') {
      await db.updateMembership(sub.id, { status: 'expired' });
    }
    return res.json({
      status: 'expired', user,
      subscription: { ...sub, status: 'expired' },
      message: `تم رفض الدخول! الاشتراك منتهٍ للاعب [${user.name}]. يرجى التجديد لدى موظف الاستقبال.`
    });
  }

  if (sub.status === 'frozen') {
    return res.json({
      status: 'frozen', user, subscription: sub,
      message: `تم رفض الدخول! هذا الاشتراك مجمد للاعب [${user.name}]. يرجى إلغاء التجميد من الاستقبال.`
    });
  }

  const newLog = await db.checkInUser(user.id);
  
  let updatedSub = sub;
  if (sub.sessions_remaining !== null) {
    updatedSub = await db.updateMembership(sub.id, { sessions_remaining: sub.sessions_remaining - 1 });
  }

  res.json({
    status: 'success', user, subscription: updatedSub,
    check_in_time: newLog.checked_in_at,
    message: `تم تسجيل الدخول بنجاح! مرحباً بك يا [${user.name}]. نتمنى لك تمريناً ممتعاً! 💪`
  });
});

// ── EXERCISES & WORKOUTS ──────────────────────────────────────────────────────

app.get('/api/exercises', async (req, res) => {
  res.json(await db.getAllExercises());
});

app.get('/api/exercises/categories', async (req, res) => {
  res.json(await db.getAllExerciseCategories());
});

app.post('/api/exercises', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { name, category_id } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: 'الرجاء إدخال عنوان التمرين والقسم' });
  }
  const newEx = await db.createExercise({ name, category_id });
  res.status(201).json(newEx);
});

app.get('/api/workouts/history/:memberId', async (req, res) => {
  res.json(await db.getWorkoutHistory(req.params.memberId));
});

app.post('/api/workouts/log', requireRole(['member']), async (req, res) => {
  const { exercise_id, sets, reps, weight } = req.body;
  if (!exercise_id) {
    return res.status(400).json({ error: 'الرجاء تعبئة بيانات التمرين بشكل صحيح' });
  }
  const log = await db.logWorkout({ user_id: req.user.id, exercise_id, sets, reps, weight });
  res.status(201).json(log);
});

// ── SERVE FRONTEND ────────────────────────────────────────────────────────────

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) res.status(200).send('<h3>B2 Gym Backend is running. Build the React frontend to view the app.</h3>');
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.initDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 B2 Gym server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

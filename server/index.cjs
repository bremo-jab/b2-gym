/**
 * server/index.cjs — Express API Server (Supabase PostgreSQL)
 * All DB calls are asynchronous using await.
 */
require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const db      = require('./db.cjs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── PROCESS ERROR SAFETY ───────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// ─── AUTO-WRAP ASYNC ROUTE HANDLERS FOR EXPRESS 4 ────────────────────────────
const originalGet = app.get.bind(app);
const originalPost = app.post.bind(app);
const originalPut = app.put.bind(app);
const originalDelete = app.delete.bind(app);

const wrap = fn => {
  if (typeof fn !== 'function') return fn;
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const wrapArgs = args => args.map(arg => typeof arg === 'function' ? wrap(arg) : arg);

app.get = (path, ...args) => {
  if (args.length === 0) return originalGet(path);
  return originalGet(path, ...wrapArgs(args));
};
app.post = (path, ...args) => originalPost(path, ...wrapArgs(args));
app.put = (path, ...args) => originalPut(path, ...wrapArgs(args));
app.delete = (path, ...args) => originalDelete(path, ...wrapArgs(args));

// JWT Configuration
const JWT_SECRET    = process.env.JWT_SECRET || 'B2Gym_S3cur3_JWT_S3cr3t_K3y_2026!';
const JWT_EXPIRES_IN = '12h';

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'https://b2-gym.vercel.app' || origin?.startsWith('http://localhost') || !origin) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.header("Access-Control-Allow-Origin", "https://b2-gym.vercel.app");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

// ─── DATABASE INITIALIZATION ──────────────────────────────────────────────────
let dbInitialized = false;
const initDbPromise = db.initDatabase()
  .then(() => {
    dbInitialized = true;
    console.log('Database initialized successfully.');
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
  });

// Middleware to ensure DB is initialized before handling requests
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    await initDbPromise;
  }
  next();
});

// ─── JWT Helpers ─────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      member_id: user.member_id,
      must_change_password: user.must_change_password === true
    },
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

    // Block users who still have a temporary password from accessing any route
    // except the force-change-password endpoint itself
    if (decoded.must_change_password && !req.path.endsWith('/force-change-password')) {
      return res.status(403).json({
        error: 'يجب تغيير رمز الدخول المؤقت أولاً قبل المتابعة',
        must_change_password: true
      });
    }

    if (!roles.includes(decoded.role)) {
      return res.status(403).json({ error: 'صلاحيات غير كافية' });
    }
    const user = await db.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }
    return res.status(401).json({ error: 'رمز المصادقة غير صالح' });
  }
};

// ─── Date Helpers ────────────────────────────────────────────────────────────

function getUTCDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function calcEndDate(startDateStr, planType, durationDays) {
  const start = new Date(startDateStr + 'T00:00:00Z');
  const day   = start.getUTCDate();

  if (planType === 'monthly') {
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.getUTCDate() !== day) next.setUTCDate(0);
    else next.setUTCDate(next.getUTCDate() - 1);
    return getUTCDateString(next);
  }

  if (planType === 'annual') {
    const next = new Date(start);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    if (next.getUTCDate() !== day) next.setUTCDate(0);
    else next.setUTCDate(next.getUTCDate() - 1);
    return getUTCDateString(next);
  }

  // sessions or fallback
  const fallback = new Date(start);
  fallback.setUTCDate(fallback.getUTCDate() + (durationDays || 30));
  return getUTCDateString(fallback);
}

// ─── PIN & Phone Validation Helpers ──────────────────────────────────────────

const phoneRegex = /^05\d{8}$/;
function isValidPhone(phone) {
  return phoneRegex.test(String(phone).trim());
}

function generate6DigitPIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── PUBLIC REGISTRATION ────────────────────────────────────────────────────

app.get('/register-member', (req, res) => {
  res.sendFile(path.join(__dirname, 'public-register.html'));
});

app.post('/api/public/register', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'الرجاء إدخال الاسم ورقم الهاتف' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05' });
  }
  try {
    const existing = await db.getUserByPhone(phone);
    if (existing) {
      return res.status(409).json({ error: 'رقم الهاتف مسجل مسبقاً. يرجى التواصل مع الاستقبال.' });
    }
    const newUser = await db.createUser({
      name,
      phone,
      role: 'member',
      password: null, // Do NOT generate PIN at this stage
      status: 'pending'
    });
    res.status(201).json({
      message: 'تم تسجيل العضوية بنجاح! سيتم تفعيل حسابك من قبل الاستقبال عند دفع الاشتراك.',
      member_id: newUser.member_id,
      name: newUser.name
    });
  } catch (err) {
    console.error('Public registration error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء التسجيل. يرجى المحاولة لاحقاً.' });
  }
});

// ─── AUTHENTICATION ─────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { phone, member_id: access_code } = req.body;
  if (!phone || !access_code) {
    return res.status(400).json({ error: 'الرجاء إدخال رقم الهاتف ورمز الدخول' });
  }

  // Try password auth (works for admin, receptionists, or members logging in with PIN)
  let user = await db.getUserByPhoneAndPassword(phone, access_code.trim());
  
  // Fallback to member_id auth for old members if any, or general checking
  if (!user) {
    user = await db.getUserByPhoneAndMemberId(phone, access_code.trim().toUpperCase());
  }

  if (!user) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة. يرجى المراجعة أو التواصل مع الاستقبال' });
  }

  let subscription = null;
  if (user.role === 'member') {
    subscription = await db.getSubscriptionByUserId(user.id);
    const today = getUTCDateString();
    if (subscription) {
      subscription.workout_unlocked_today = await db.isWorkoutUnlockedForDay(user.id, today);
    }
  }

  const token = signToken(user);
  res.json({ token, user, subscription, must_change_password: user.must_change_password === true });
});

app.get('/api/auth/me', requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const subscription = req.user.role === 'member' ? await db.getSubscriptionByUserId(req.user.id) : null;
  if (subscription) {
    subscription.workout_unlocked_today = await db.isWorkoutUnlockedForDay(req.user.id, getUTCDateString());
  }
  res.json({ user: req.user, subscription });
});

app.post('/api/auth/change-password', requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور الحالية والجديدة' });
  }
  if (newPassword.length !== 6 || !/^\d{6}$/.test(newPassword)) {
    return res.status(400).json({ error: 'رمز الدخول الجديد يجب أن يتكون من 6 أرقام فقط' });
  }
  if (req.user.password !== currentPassword) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  try {
    const updated = await db.updateUser(req.user.id, { password: newPassword });
    res.json({ message: 'تم تغيير رمز الدخول بنجاح', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'فشل تغيير رمز الدخول' });
  }
});

// ─── FORCE CHANGE PASSWORD (first-login, no current password needed) ─────────

app.post('/api/auth/force-change-password', requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'الرجاء إدخال رمز الدخول الجديد وتأكيده' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'رمز الدخول الجديد وتأكيده غير متطابقان' });
  }
  if (newPassword.length !== 6 || !/^\d{6}$/.test(newPassword)) {
    return res.status(400).json({ error: 'رمز الدخول يجب أن يتكون من 6 أرقام فقط' });
  }

  try {
    const updated = await db.changeUserPassword(req.user.id, newPassword);
    // Issue a fresh token with must_change_password = false
    const newToken = signToken(updated);
    res.json({
      message: 'تم تغيير رمز الدخول بنجاح! جاري التحويل...',
      token: newToken,
      user: updated
    });
  } catch (err) {
    console.error('force-change-password error:', err);
    res.status(500).json({ error: 'فشل تغيير رمز الدخول' });
  }
});

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────

app.get('/api/notifications', requireRole(['member']), async (req, res) => {
  const notifications = await db.getNotificationsForUser(req.user.id);
  res.json(notifications);
});

// ─── SUBSCRIPTION PLANS ─────────────────────────────────────────────────────

app.get('/api/plans', async (req, res) => {
  const plans = await db.getAllSubscriptionPlans();
  res.json(plans);
});

app.post('/api/plans', requireRole(['admin']), async (req, res) => {
  try {
    const { name, type, price, duration_days, sessions_count, is_active } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'الرجاء تعبئة الحقول المطلوبة' });
    }
    const plan = await db.createSubscriptionPlan({ name, type, price, duration_days, sessions_count, is_active });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: 'فشل حفظ الباقة — ' + err.message });
  }
});

app.put('/api/plans/:id', requireRole(['admin']), async (req, res) => {
  try {
    const updated = await db.updateSubscriptionPlan(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'الباقة غير موجودة' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث الباقة — ' + err.message });
  }
});

app.delete('/api/plans/:id', requireRole(['admin']), async (req, res) => {
  try {
    await db.deleteSubscriptionPlan(req.params.id);
    res.json({ message: 'تم حذف الباقة بنجاح' });
  } catch {
    res.status(404).json({ error: 'الباقة غير موجودة' });
  }
});

// ─── MEMBERS MANAGEMENT ─────────────────────────────────────────────────────

app.get('/api/users', requireRole(['admin', 'receptionist']), async (req, res) => {
  const users = await db.getAllUsers();
  const joined = [];
  for (const u of users) {
    const sub = await db.getSubscriptionByUserId(u.id);
    joined.push({ ...u, subscription: sub });
  }
  res.json(joined);
});

app.post('/api/users', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { name, phone, role, plan_id, start_date, status } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'الرجاء إدخال الاسم ورقم الهاتف' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05' });
  }

  try {
    const existingPhone = await db.getUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ error: 'رقم الهاتف مسجل مسبقاً في النظام' });
    }

    const isStaff = role && role !== 'member';

    // All accounts (staff and members) get an auto-generated PIN and must change it on first login
    const genPassword = generate6DigitPIN();

    const newUser = await db.createUser({
      name,
      phone,
      role: role || 'member',
      // member_id is always auto-generated — never accepted from the request body for staff
      password: genPassword,
      status: status || 'active',
      must_change_password: true
    });

    if (!isStaff && plan_id) {
      const plan = await db.getSubscriptionPlanById(plan_id);
      if (plan) {
        const sDate = start_date || getUTCDateString();
        const eDate = calcEndDate(sDate, plan.type, plan.duration_days);
        await db.createMembership({
          user_id: newUser.id,
          plan_id: plan.id,
          status: 'active',
          start_date: sDate,
          end_date: eDate,
          sessions_remaining: plan.sessions_count || null
        });
      }
    }

    const sub = await db.getSubscriptionByUserId(newUser.id);
    res.status(201).json({ ...newUser, generated_password: genPassword, subscription: sub || null });
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: 'فشل تسجيل المستخدم — ' + err.message });
  }
});

app.put('/api/users/:id', requireRole(['admin', 'receptionist']), async (req, res) => {
  if (req.body.phone !== undefined && !isValidPhone(req.body.phone)) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05' });
  }
  const updatedUser = await db.updateUser(req.params.id, req.body);
  if (!updatedUser) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const { plan_id, start_date, subscription_status } = req.body;

  if (plan_id) {
    const plan = await db.getSubscriptionPlanById(plan_id);
    if (plan) {
      const sDate = start_date || getUTCDateString();
      const eDate = calcEndDate(sDate, plan.type, plan.duration_days);
      const currentSub = await db.getSubscriptionByUserId(updatedUser.id);
      if (currentSub) {
        await db.updateMembership(currentSub.id, {
          status: subscription_status || 'active',
          start_date: sDate,
          end_date: eDate,
          sessions_remaining: plan.sessions_count || null
        });
      } else {
        await db.createMembership({
          user_id: updatedUser.id,
          plan_id: plan.id,
          status: subscription_status || 'active',
          start_date: sDate,
          end_date: eDate,
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

// ─── USER ACTIVATION ─────────────────────────────────────────────────────────

app.post('/api/users/:id/activate', requireRole(['admin', 'receptionist']), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const pin = generate6DigitPIN();
    const updatedUser = await db.updateUser(user.id, {
      status: 'active',
      password: pin,
      must_change_password: true
    });

    res.json({
      message: 'تم تفعيل الحساب بنجاح',
      user: updatedUser,
      generated_password: pin
    });
  } catch (err) {
    console.error('Activation error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تفعيل الحساب' });
  }
});

// ─── SUBSCRIPTION RENEWAL ────────────────────────────────────────────────────

app.post('/api/subscriptions/renew', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { user_id, plan_id, start_date } = req.body;
  if (!user_id || !plan_id) {
    return res.status(400).json({ error: 'الرجاء اختيار المشترك والباقة' });
  }

  const plan = await db.getSubscriptionPlanById(plan_id);
  if (!plan) return res.status(404).json({ error: 'الباقة غير موجودة' });

  const sDate = start_date || getUTCDateString();
  const eDate = calcEndDate(sDate, plan.type, plan.duration_days);
  const currentSub = await db.getSubscriptionByUserId(user_id);

  if (currentSub) {
    const updated = await db.updateMembership(currentSub.id, {
      status: 'active',
      start_date: sDate,
      end_date: eDate,
      sessions_remaining: plan.sessions_count || null
    });
    return res.json({ message: 'تم تجديد الاشتراك بنجاح', subscription: updated });
  }

  const created = await db.createMembership({
    user_id,
    plan_id: plan.id,
    status: 'active',
    start_date: sDate,
    end_date: eDate,
    sessions_remaining: plan.sessions_count || null
  });
  res.status(201).json({ message: 'تم إنشاء اشتراك جديد بنجاح', subscription: created });
});

// ─── FREEZE / UNFREEZE SUBSCRIPTION ─────────────────────────────────────────

app.post('/api/subscriptions/freeze', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'الرجاء تحديد المشترك' });

  const sub = await db.getSubscriptionByUserId(user_id);
  if (!sub) return res.status(404).json({ error: 'لا يوجد اشتراك لهذا المشترك' });
  if (sub.status === 'frozen') return res.status(400).json({ error: 'الاشتراك مجمد مسبقاً' });

  const updated = await db.updateMembership(sub.id, {
    status: 'frozen',
    freeze_start_date: getUTCDateString(),
    freeze_days_used: sub.freeze_days_used || 0
  });
  res.json({ message: 'تم تجميد الاشتراك بنجاح', subscription: updated });
});

app.post('/api/subscriptions/unfreeze', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'الرجاء تحديد المشترك' });

  const sub = await db.getSubscriptionByUserId(user_id);
  if (!sub) return res.status(404).json({ error: 'لا يوجد اشتراك لهذا المشترك' });
  if (sub.status !== 'frozen') return res.status(400).json({ error: 'الاشتراك ليس مجمداً' });

  let newEndDate = sub.end_date;
  if (sub.freeze_start_date && sub.end_date) {
    const freezeStart = new Date(sub.freeze_start_date + 'T00:00:00Z');
    const today = new Date(getUTCDateString() + 'T00:00:00Z');
    const frozenDays = Math.max(0, Math.floor((today - freezeStart) / (1000 * 60 * 60 * 24)));
    const endDate = new Date(sub.end_date + 'T00:00:00Z');
    endDate.setUTCDate(endDate.getUTCDate() + frozenDays);
    newEndDate = getUTCDateString(endDate);
  }

  const updated = await db.updateMembership(sub.id, {
    status: 'active',
    end_date: newEndDate,
    freeze_start_date: null,
    freeze_days_used: (sub.freeze_days_used || 0)
  });
  res.json({ message: 'تم إلغاء تجميد الاشتراك وتمديد المدة بنجاح', subscription: updated });
});

// ─── QR CHECK-IN ─────────────────────────────────────────────────────────────

app.post('/api/checkin', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'الرمز غير صحيح أو مفقود' });

  const users = await db.getAllUsers();
  const user = users.find(u => u.member_id === member_id.trim().toUpperCase());
  if (!user) {
    return res.status(404).json({ error: 'لم يتم العثور على أي مشترك بهذا الرمز' });
  }

  if (user.role !== 'member') {
    return res.status(400).json({ error: 'هذا الرمز لا يخص مشتركاً في النادي' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({
      success: false, status: 'pending', user,
      message: `تم رفض الدخول! حساب اللاعب [${user.name}] غير مفعل بعد. يرجى تفعيل الحساب من الاستقبال.`
    });
  }

  const todayUTC = getUTCDateString();
  const sub = await db.getSubscriptionByUserId(user.id);

  if (!sub) {
    return res.status(403).json({
      success: false, status: 'error', user,
      message: `تم رفض الدخول! لا يوجد اشتراك مسجل للاعب [${user.name}].`
    });
  }

  const normalizedStatus = String(sub.status || '').trim().toLowerCase();
  const subEndDate     = sub.end_date ? new Date(sub.end_date + 'T00:00:00Z') : null;
  const todayStartUtc  = new Date(todayUTC + 'T00:00:00Z');
  const isExpiredByDate     = subEndDate && !isNaN(subEndDate) && subEndDate < todayStartUtc;
  const isExpiredBySessions = sub.sessions_remaining !== null && sub.sessions_remaining !== undefined && Number(sub.sessions_remaining) <= 0;
  const isExplicit          = ['expired', 'inactive', 'cancelled'].includes(normalizedStatus);
  const isExpired           = isExplicit || isExpiredByDate || isExpiredBySessions;

  if (isExpired) {
    if (sub.status !== 'expired') {
      await db.updateMembership(sub.id, { status: 'expired' });
    }
    return res.status(403).json({
      success: false, status: 'expired', user,
      subscription: { ...sub, status: 'expired' },
      message: `عذراً، اشتراك هذا اللاعب منتهٍ! لا يمكن تسجيل الدخول.`
    });
  }

  if (sub.status === 'frozen') {
    return res.status(403).json({
      success: false, status: 'frozen', user, subscription: sub,
      message: `تم رفض الدخول! الاشتراك مجمد للاعب [${user.name}].`
    });
  }

  const todaysLogs = await db.getAttendanceByUserId(user.id, 100);
  const alreadyToday = todaysLogs.some(log => {
    const logDate = new Date(log.checked_in_at).toISOString().split('T')[0];
    return logDate === todayUTC;
  });

  if (alreadyToday) {
    await db.unlockWorkoutForDay(user.id, todayUTC);
    return res.json({
      success: true, status: 'already_checked_in', user,
      message: 'تنبيه: تم تسجيل دخول هذا اللاعب مسبقاً اليوم!',
      workout_unlocked: true
    });
  }

  const newLog = await db.checkInUser(user.id);
  await db.unlockWorkoutForDay(user.id, todayUTC);

  let updatedSub = sub;
  if (sub.sessions_remaining !== null && sub.sessions_remaining !== undefined) {
    updatedSub = await db.updateMembership(sub.id, {
      sessions_remaining: Math.max(0, Number(sub.sessions_remaining) - 1)
    });
  }

  res.json({
    status: 'success', user,
    subscription: updatedSub,
    check_in_time: newLog.checked_in_at,
    workout_unlocked: true,
    message: `تم تسجيل الدخول بنجاح! مرحباً بك يا [${user.name}]. نتمنى لك تمريناً ممتعاً! 💪`
  });
});

// ─── EXERCISES & CATEGORIES ─────────────────────────────────────────────────

app.get('/api/exercises', async (req, res) => {
  const exercises = await db.getAllExercises();
  res.json(exercises);
});

app.get('/api/exercises/categories', async (req, res) => {
  const categories = await db.getAllExerciseCategories();
  res.json(categories);
});

app.post('/api/exercises/categories', requireRole(['admin']), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
  const cat = await db.createExerciseCategory(name);
  res.status(201).json(cat);
});

app.delete('/api/exercises/categories/:id', requireRole(['admin']), async (req, res) => {
  await db.deleteExerciseCategory(req.params.id);
  res.json({ message: 'تم حذف الفئة بنجاح' });
});

app.post('/api/exercises', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { name, category_id, description, video_url } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: 'الرجاء إدخال عنوان التمرين والقسم' });
  }
  const newEx = await db.createExercise({ name, category_id, description, video_url });
  res.status(201).json(newEx);
});

app.put('/api/exercises/:id', requireRole(['admin']), async (req, res) => {
  const updated = await db.updateExercise(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'التمرين غير موجود' });
  res.json(updated);
});

app.delete('/api/exercises/:id', requireRole(['admin']), async (req, res) => {
  await db.deleteExercise(req.params.id);
  res.json({ message: 'تم حذف التمرين بنجاح' });
});

// ─── WORKOUT LOGS ────────────────────────────────────────────────────────────

app.get('/api/workouts/history/:userId', async (req, res) => {
  const history = await db.getWorkoutHistory(req.params.userId);
  res.json(history);
});

app.post('/api/workouts/log', requireRole(['member']), async (req, res) => {
  const { exercise_id, sets, reps, weight, notes } = req.body;
  if (!exercise_id) {
    return res.status(400).json({ error: 'الرجاء تعبئة بيانات التمرين' });
  }
  const log = await db.logWorkout({
    user_id: req.user.id,
    exercise_id,
    sets: sets || null,
    reps: reps || null,
    weight: weight || null,
    notes: notes || null
  });
  res.status(201).json(log);
});

// ─── WORKOUT UNLOCK STATUS ──────────────────────────────────────────────────

app.get('/api/workouts/unlock-status', requireRole(['member']), async (req, res) => {
  const today = getUTCDateString();
  const unlocked = await db.isWorkoutUnlockedForDay(req.user.id, today);
  res.json({ unlocked, date: today });
});

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', requireRole(['admin']), async (req, res) => {
  try {
    const todayUTC  = getUTCDateString();
    const allUsers  = await db.getAllUsers();
    const members   = allUsers.filter(u => u.role === 'member');

    let activeMembersCount = 0;
    let nearExpirationCount = 0;
    const atRiskMembers = [];

    for (const m of members) {
      const sub = await db.getSubscriptionByUserId(m.id);
      if (sub && sub.status === 'active') {
        const isExpiredByDate     = sub.end_date && sub.end_date < todayUTC;
        const isExpiredBySessions = sub.sessions_remaining !== null && sub.sessions_remaining <= 0;
        if (!isExpiredByDate && !isExpiredBySessions) {
          activeMembersCount++;
          if (sub.end_date) {
            const daysLeft = Math.ceil((new Date(sub.end_date + 'T00:00:00Z') - new Date(todayUTC + 'T00:00:00Z')) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 7 && daysLeft >= 0) nearExpirationCount++;
          }
        }
      }
    }

    const allLogs = await db.getAttendanceLogs(10000);
    const attendanceTodayCount = allLogs.filter(l => {
      const logDate = new Date(l.checked_in_at).toISOString().split('T')[0];
      return logDate === todayUTC;
    }).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const recentLogs = allLogs.filter(l => new Date(l.checked_in_at) >= sevenDaysAgo);

    const hourCounts = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    recentLogs.forEach(l => {
      const hour = new Date(l.checked_in_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHoursChart = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: parseInt(hour),
      count
    }));

    const dayLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayCounts = {};
    dayLabels.forEach((d, i) => { dayCounts[i] = 0; });
    recentLogs.forEach(l => {
      const day = new Date(l.checked_in_at).getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const weeklyChart = Object.entries(dayCounts).map(([day, count]) => ({
      day: parseInt(day),
      label: dayLabels[parseInt(day)],
      count
    }));

    const workoutUsers = new Set();
    for (const m of members) {
      const hist = await db.getWorkoutHistory(m.id, 1);
      if (hist.length > 0) {
        const lastLog = new Date(hist[0].logged_at);
        if (lastLog >= sevenDaysAgo) workoutUsers.add(m.id);
      }
    }
    const engagementRate = activeMembersCount > 0
      ? Math.round((workoutUsers.size / activeMembersCount) * 100)
      : 0;

    for (const m of members) {
      const sub = await db.getSubscriptionByUserId(m.id);
      if (sub && sub.status === 'active') {
        const isExpiredByDate     = sub.end_date && sub.end_date < todayUTC;
        const isExpiredBySessions = sub.sessions_remaining !== null && sub.sessions_remaining <= 0;
        if (!isExpiredByDate && !isExpiredBySessions) {
          const userLogs = await db.getAttendanceByUserId(m.id, 1);
          let atRisk = false;
          let lastCheckIn = null;
          if (userLogs.length > 0) {
            lastCheckIn = new Date(userLogs[0].checked_in_at);
            const daysSince = Math.floor((new Date() - lastCheckIn) / (1000 * 60 * 60 * 24));
            if (daysSince >= 10) atRisk = true;
          } else {
            const daysSinceCreated = Math.floor((new Date() - new Date(m.created_at)) / (1000 * 60 * 60 * 24));
            if (daysSinceCreated >= 10) atRisk = true;
          }
          if (atRisk) {
            atRiskMembers.push({
              id: m.id, name: m.name, phone: m.phone, member_id: m.member_id,
              last_check_in: lastCheckIn ? getUTCDateString(lastCheckIn) : 'لم يسجل حضوراً أبداً'
            });
          }
        }
      }
    }

    res.json({
      kpis: { activeMembersCount, attendanceTodayCount, monthlyRevenue: 0, nearExpirationCount },
      peakHoursChart,
      weeklyChart,
      engagementRate,
      atRiskMembers
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'فشل تحميل إحصائيات لوحة التحكم' });
  }
});

// ─── ATTENDANCE LOGS ─────────────────────────────────────────────────────────

app.get('/api/attendance/logs', requireRole(['admin']), async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  try {
    const logs = await db.getAttendanceLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SERVE FRONTEND ──────────────────────────────────────────────────────────

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) res.status(200).send('<h3>B2 Gym Backend is running. Use npm run dev for frontend.</h3>');
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const origin = req.headers.origin;
  if (origin === 'https://b2-gym.vercel.app' || origin?.startsWith('http://localhost') || !origin) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.header("Access-Control-Allow-Origin", "https://b2-gym.vercel.app");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// ─── START ───────────────────────────────────────────────────────────────────


if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 B2 Gym server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend: http://localhost:5173 (via npm run dev)`);
    console.log(`🔑 Admin login: 0599988424 / 123456\n`);
  });
}

module.exports = app;

/**
 * server/index.cjs — Express API Server (Supabase PostgreSQL)
 * All DB calls are asynchronous using await.
 */
require('dotenv').config({ path: __dirname + '/.env' });
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db        = require('./db.cjs');

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
const ALLOWED_ORIGINS = [
  'https://b2-gym.com',
  'https://www.b2-gym.com',
  'https://b2-gym.vercel.app'
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.header("Access-Control-Allow-Origin", "https://b2-gym.com");
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

// ─── RATE LIMITING ──────────────────────────────────────────────────────────────────────

// Auth: max 1000 attempts per IP per 15 minutes (relaxed for testing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح من محاولات تسجيل الدخول. يرجى المحاولة بعد 15 دقيقة.' }
});

// Public registration: max 200 registrations per IP per hour
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح من طلبات التسجيل. يرجى المحاولة بعد ساعة.' }
});

// General API limiter: max 5000 requests per IP per 15 minutes (relaxed check-in, etc.)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد قليل.' }
});

app.use('/api/', apiLimiter);

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

function getRiyadhDateString(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(date);
  } catch (e) {
    const shifted = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return shifted.toISOString().split('T')[0];
  }
}

function getDaysDifference(endDateStr, todayStr) {
  if (!endDateStr || !todayStr) return null;
  const end = new Date(endDateStr.substring(0, 10) + 'T00:00:00Z');
  const today = new Date(todayStr.substring(0, 10) + 'T00:00:00Z');
  if (isNaN(end.getTime()) || isNaN(today.getTime())) return null;
  const diffMs = end.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function calcEndDate(startDateStr, planType, durationDays) {
  if (durationDays === 1) {
    return startDateStr;
  }
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public-register.html'));
});

app.post('/api/public/register', registerLimiter, async (req, res) => {
  const { name, phone, pin } = req.body;
  if (!name || !phone || !pin) {
    return res.status(400).json({ error: 'الرجاء إدخال الاسم، رقم الهاتف، والرقم السري (PIN)' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05' });
  }
  const cleanedPin = String(pin).trim();
  if (cleanedPin.length !== 6 || !/^\d{6}$/.test(cleanedPin)) {
    return res.status(400).json({ error: 'يجب أن يتكون الرمز السري من 6 أرقام بالضبط' });
  }
  try {
    const existing = await db.getUserByPhone(phone);
    if (existing) {
      return res.status(409).json({ error: 'رقم الهاتف مسجل مسبقاً. يمكنك تسجيل الدخول مباشرة أو التواصل مع الاستقبال.' });
    }
    const newUser = await db.createUser({
      name: name.trim(),
      phone: phone.trim(),
      role: 'member',
      password: cleanedPin,
      status: 'active',
      must_change_password: false
    });
    const token = signToken(newUser);
    res.status(201).json({
      message: 'تم تسجيل حسابك وتفعيله بنجاح! يمكنك الآن تسجيل الدخول برقم الهاتف والرمز السري (PIN).',
      token,
      user: newUser,
      subscription: null
    });
  } catch (err) {
    console.error('Public registration error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء التسجيل. يرجى المحاولة لاحقاً.' });
  }
});

// ─── AUTHENTICATION ─────────────────────────────────────────────────────────

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { phone, member_id: access_code } = req.body;
  if (!phone || !access_code) {
    return res.status(400).json({ error: 'الرجاء إدخال رقم الهاتف ورمز الدخول' });
  }

  const cleanedPhone = String(phone).trim();
  const cleanedCode  = String(access_code).trim();

  // 1. Search user by phone first
  let user = await db.getUserByPhone(cleanedPhone);

  // Fallback: check by member_id if phone didn't match directly
  if (!user) {
    user = await db.getUserByMemberId(cleanedCode.toUpperCase());
  }

  // If user does not exist in DB -> 401
  if (!user) {
    console.log(`🔐 Login failed -> User not found for phone: ${cleanedPhone}`);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة، يرجى التأكد من رقم الهاتف ورمز الدخول.' });
  }

  console.log(`🔐 Login attempt -> User ID: ${user.id}, Phone: ${cleanedPhone}, Status: ${user.status}, Role: ${user.role}`);

  // 2. Check Account Status (pending / inactive)
  if (user.status === 'pending' || user.status === 'inactive' || user.activation_status === 'pending') {
    console.log(`⚠️ Login blocked -> Account status is '${user.status}' for user ID: ${user.id}`);
    return res.status(403).json({ error: 'حسابك قيد الانتظار ولم يتم تفعيله بعد، يرجى مراجعة موظف الاستقبال لتفعيل الاشتراك.' });
  }

  // 3. Match PIN / Password
  let isValidPassword = false;
  if (user.password) {
    isValidPassword = await bcrypt.compare(cleanedCode, user.password);
  }

  // Fallback check for initial member_id as temporary PIN if must_change_password is true
  if (!isValidPassword && user.must_change_password === true && user.member_id) {
    if (user.member_id.toUpperCase() === cleanedCode.toUpperCase()) {
      isValidPassword = true;
    }
  }

  if (!isValidPassword) {
    console.log(`🔐 Login failed -> Invalid PIN for user ID: ${user.id}`);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة، يرجى التأكد من رقم الهاتف ورمز الدخول.' });
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

app.post('/api/auth/change-password', authLimiter, requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور الحالية والجديدة' });
  }
  const cleanedNewPassword = String(newPassword).trim();
  if (cleanedNewPassword.length !== 6 || !/^\d{6}$/.test(cleanedNewPassword)) {
    return res.status(400).json({ error: 'رمز الدخول الجديد يجب أن يتكون من 6 أرقام فقط' });
  }

  // Verify current password using bcrypt or temporary member_id PIN
  let passwordMatch = false;
  if (req.user.password) {
    passwordMatch = await bcrypt.compare(String(currentPassword), req.user.password);
  } else if (req.user.member_id) {
    passwordMatch = String(currentPassword).trim().toUpperCase() === String(req.user.member_id).trim().toUpperCase();
  }

  if (!passwordMatch) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  try {
    const updated = await db.changeUserPassword(req.user.id, newPassword);
    res.json({ message: 'تم تغيير رمز الدخول بنجاح', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'فشل تغيير رمز الدخول' });
  }
});

// ─── FORCE CHANGE PASSWORD (first-login, no current password needed) ─────────

app.post('/api/auth/force-change-password', authLimiter, requireRole(['admin', 'receptionist', 'member']), async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'الرجاء إدخال رمز الدخول الجديد وتأكيده' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'رمز الدخول الجديد وتأكيده غير متطابقان' });
  }
  const cleaned = String(newPassword).trim();
  if (cleaned.length !== 6 || !/^\d{6}$/.test(cleaned)) {
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

// ─── BCRYPT MIGRATION (one-time admin tool) ───────────────────────────────────
// Re-hashes all plain-text passwords in the users table using bcrypt.
// Protected by MIGRATE_SECRET env var. Run ONCE after deploying the bcrypt update.
app.post('/api/admin/migrate-passwords', async (req, res) => {
  const secret = process.env.MIGRATE_SECRET;
  if (!secret || req.headers['x-migrate-secret'] !== secret) {
    return res.status(403).json({ error: 'غير مصرح — مفتاح الترحيل مطلوب' });
  }
  try {
    const { rows: allUsers } = await db.pool.query('SELECT id, password FROM users');
    let migrated = 0;
    let skipped  = 0;
    for (const u of allUsers) {
      if (!u.password) { skipped++; continue; }
      if (String(u.password).startsWith('$2')) { skipped++; continue; } // already hashed
      const hashed = await bcrypt.hash(String(u.password), 10);
      await db.pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, u.id]);
      migrated++;
    }
    res.json({ message: `تم تشفير ${migrated} كلمة مرور. تخطي ${skipped}.`, migrated, skipped });
  } catch (err) {
    console.error('Password migration error:', err);
    res.status(500).json({ error: 'فشل ترحيل كلمات المرور: ' + err.message });
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
  // Single JOIN query — no N+1 loop
  const { rows } = await db.pool.query(
    `SELECT u.*,
            m.id         AS membership_id,
            m.status     AS sub_status,
            m.start_date AS sub_start_date,
            m.end_date   AS sub_end_date,
            m.sessions_remaining,
            m.freeze_start_date,
            m.freeze_days_used,
            p.name       AS plan_name,
            p.type       AS plan_type,
            p.price      AS plan_price
     FROM users u
     LEFT JOIN memberships m ON m.id = (
       SELECT id FROM memberships WHERE user_id = u.id ORDER BY id DESC LIMIT 1
     )
     LEFT JOIN subscription_plans p ON m.plan_id = p.id
     ORDER BY u.created_at DESC`
  );

  // Shape each row into { ...user, subscription: {...} | null }
  const joined = rows.map(row => {
    const { membership_id, sub_status, sub_start_date, sub_end_date,
            sessions_remaining, freeze_start_date, freeze_days_used,
            plan_name, plan_type, plan_price, ...user } = row;
    const subscription = membership_id ? {
      id: membership_id,
      status: sub_status,
      start_date: sub_start_date,
      end_date: sub_end_date,
      sessions_remaining,
      freeze_start_date,
      freeze_days_used,
      plan_name,
      plan_type,
      plan_price
    } : null;
    return { ...user, subscription };
  });

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
        const todayUTC = getUTCDateString();
        await db.checkInUser(newUser.id);
        await db.unlockWorkoutForDay(newUser.id, todayUTC);
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

app.post('/api/users/:id/reset-pin', requireRole(['admin', 'receptionist']), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'معرّف المستخدم غير صحيح' });
  }

  const cleanedPin = pin ? String(pin).trim() : '';
  if (!pin || cleanedPin.length !== 6 || !/^\d{6}$/.test(cleanedPin)) {
    return res.status(400).json({ error: 'الرقم السري (PIN) يجب أن يتكون من 6 أرقام فقط' });
  }

  try {
    const targetUser = await db.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // Role protection: Only admin can reset PIN of staff (admin, receptionist)
    if (targetUser.role !== 'member' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بإعادة تعيين الرقم السري لهذا المستخدم' });
    }

    const updated = await db.updateUser(userId, {
      password: String(pin).trim()
    });

    res.json({ message: 'تم إعادة تعيين الرقم السري بنجاح', user: updated });
  } catch (err) {
    console.error('Reset PIN error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء إعادة تعيين الرقم السري' });
  }
});

app.delete('/api/users/:id', requireRole(['admin']), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'معرّف المشترك غير صحيح' });
  }

  // Prevent logged-in admin from deleting themselves
  if (req.user && req.user.id === userId) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي الخاص بالإدارة' });
  }

  try {
    const targetUser = await db.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'لم يتم العثور على هذا المشترك في قاعدة البيانات' });
    }

    await db.deleteUser(userId);
    res.json({ message: `تم حذف حساب المشترك [${targetUser.name}] وكافة بياناته وسجلاته نهائياً من النظام.` });
  } catch (err) {
    console.error('Failed to permanently delete user:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ عملية الحذف النهائي من قاعدة البيانات' });
  }
});

app.delete('/api/members/:id', requireRole(['admin', 'receptionist']), async (req, res) => {
  const memberId = parseInt(req.params.id);
  if (isNaN(memberId)) {
    return res.status(400).json({ error: 'معرّف المشترك غير صحيح' });
  }

  try {
    const targetUser = await db.getUserById(memberId);
    if (!targetUser) {
      return res.status(404).json({ error: 'لم يتم العثور على هذا المشترك في قاعدة البيانات' });
    }

    // Only allow deleting users with role 'member'
    if (targetUser.role !== 'member') {
      return res.status(403).json({ error: 'غير مسموح بحذف حسابات الإدارة أو موظفي الاستقبال من هنا' });
    }

    await db.deleteUser(memberId);
    res.json({ message: `تم حذف حساب المشترك [${targetUser.name}] وكافة بياناته وسجلاته نهائياً من النظام.` });
  } catch (err) {
    console.error('Failed to permanently delete member:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ عملية الحذف النهائي من قاعدة البيانات' });
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
    res.status(500).json({ error: 'حدث خطأ أثناء تفعيل الحساب — ' + err.message });
  }
});

// ─── SUBSCRIPTION RENEWAL ────────────────────────────────────────────────────

app.post('/api/subscriptions/renew', requireRole(['admin', 'receptionist']), async (req, res) => {
  const { user_id, plan_id, start_date, auto_checkin } = req.body;
  if (!user_id || !plan_id) {
    return res.status(400).json({ error: 'الرجاء اختيار المشترك والباقة' });
  }

  const plan = await db.getSubscriptionPlanById(plan_id);
  if (!plan) return res.status(404).json({ error: 'الباقة غير موجودة' });

  const sDate = start_date || getUTCDateString();
  const eDate = calcEndDate(sDate, plan.type, plan.duration_days);
  const currentSub = await db.getSubscriptionByUserId(user_id);
  let updatedSub = null;

  if (currentSub) {
    updatedSub = await db.updateMembership(currentSub.id, {
      status: 'active',
      plan_id: plan.id,
      start_date: sDate,
      end_date: eDate,
      sessions_remaining: plan.sessions_count || null
    });
  } else {
    updatedSub = await db.createMembership({
      user_id,
      plan_id: plan.id,
      status: 'active',
      start_date: sDate,
      end_date: eDate,
      sessions_remaining: plan.sessions_count || null
    });
  }

  await db.updateUser(user_id, { status: 'active' });

  // MANDATORY auto-checkin and workout unlock for today on any renewal
  const todayUTC = getUTCDateString();
  await db.checkInUser(user_id);
  await db.unlockWorkoutForDay(user_id, todayUTC);

  res.status(200).json({
    message: 'تم تسديد الدفعة، تجديد الاشتراك، وتسجيل حضور اللاعب وفتح التمارين لليوم بنجاح! 💳',
    subscription: updatedSub,
    workout_unlocked: true
  });
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

  const scanned = String(member_id || '').trim();
  let user = null;

  // 1. Try by member_id
  user = await db.getUserByMemberId(scanned);

  // 2. If not found and input is numeric, try by database ID
  if (!user && /^\d+$/.test(scanned)) {
    user = await db.getUserById(parseInt(scanned, 10));
  }

  // 3. If not found, try by phone number
  if (!user) {
    user = await db.getUserByPhone(scanned);
  }

  if (!user) {
    return res.status(404).json({ error: 'لم يتم العثور على أي مشترك يطابق الرمز أو رقم الهاتف المدخل' });
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

  // Check for duplicate check-in today
  const todaysLogs = await db.getAttendanceByUserId(user.id, 100);
  const alreadyTodayLog = todaysLogs.find(log => {
    const logDate = new Date(log.checked_in_at).toISOString().split('T')[0];
    return logDate === todayUTC;
  });

  if (alreadyTodayLog) {
    await db.unlockWorkoutForDay(user.id, todayUTC);
    return res.json({
      success: true,
      status: 'already_checked_in',
      user,
      check_in_time: alreadyTodayLog.checked_in_at,
      message: `تنبيه: تم تسجيل حضور اللاعب [${user.name}] مسبقاً اليوم.`,
      workout_unlocked: true
    });
  }

  // If not checked in, check subscription validity
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
  const { name, category_id, description, video_url, sets, reps } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: 'الرجاء إدخال عنوان التمرين والقسم' });
  }
  const newEx = await db.createExercise({ name, category_id, description, video_url, sets, reps });
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
    const todayStr = getRiyadhDateString();

    // ── 1. Batch-load all members + their latest subscription in 2 SQL queries ──
    const { rows: allMembers } = await db.pool.query(
      `SELECT u.*, m.id AS m_id, m.status AS sub_status, m.start_date, m.end_date,
              m.sessions_remaining, m.plan_id,
              p.name AS plan_name, p.price AS plan_price
       FROM users u
       LEFT JOIN memberships m ON m.id = (
         SELECT id FROM memberships WHERE user_id = u.id ORDER BY id DESC LIMIT 1
       )
       LEFT JOIN subscription_plans p ON m.plan_id = p.id
       WHERE u.role = 'member' AND u.status IN ('active', 'expired')
       ORDER BY u.created_at DESC`
    );

    // ── 2. KPI counters & Revenue ────────────────────────────────────────────
    let activeMembersCount = 0;
    let nearExpirationCount = 0;
    const currentMonth = todayStr.substring(0, 7); // 'YYYY-MM'
    const activeMemberIds = new Set();

    for (const m of allMembers) {
      const subStatus = m.sub_status;
      const endDate   = m.end_date;
      const sessLeft  = m.sessions_remaining;

      // Calculate days difference relative to todayStr (Asia/Riyadh timezone)
      const daysLeft = getDaysDifference(endDate, todayStr);

      const isExpiredByDate     = daysLeft !== null && daysLeft < 0;
      const isExpiredBySessions = sessLeft !== null && sessLeft !== undefined && Number(sessLeft) <= 0;
      const isActive = subStatus === 'active' && !isExpiredByDate && !isExpiredBySessions;

      if (isActive) {
        activeMembersCount++;
        activeMemberIds.add(m.id);
      }

      // Count all expired memberships + memberships expiring in 3 days or less
      if (m.m_id) {
        const isExpired = isExpiredByDate || subStatus === 'expired' || m.status === 'expired';
        const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

        if (isExpired || isExpiringSoon) {
          nearExpirationCount++;
        }
      }
    }

    // Comprehensive Monthly Revenue: Sum prices of all subscriptions/passes started in current month or active
    const { rows: revRows } = await db.pool.query(
      `SELECT COALESCE(SUM(p.price), 0) AS total_revenue
       FROM memberships m
       JOIN subscription_plans p ON m.plan_id = p.id
       WHERE m.start_date LIKE $1 OR (m.status = 'active' AND (m.end_date >= $2 OR m.end_date IS NULL))`,
      [`${currentMonth}%`, todayStr]
    );
    const monthlyRevenue = parseFloat(revRows[0]?.total_revenue || 0);

    // ── 3. Attendance stats — single SQL query (no 10000-row limit) ──────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const { rows: recentLogs } = await db.pool.query(
      `SELECT user_id, checked_in_at
       FROM attendance_logs
       WHERE checked_in_at >= $1
       ORDER BY checked_in_at DESC`,
      [sevenDaysAgoISO]
    );

    const { rows: todayCountRaw } = await db.pool.query(
      `SELECT COUNT(*) AS cnt FROM attendance_logs
       WHERE checked_in_at::date = $1::date`,
      [todayStr]
    );
    const attendanceTodayCount = parseInt(todayCountRaw[0]?.cnt || 0);

    // Peak hours chart — using Palestine timezone (Asia/Jerusalem = UTC+3)
    const hourCounts = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    recentLogs.forEach(l => {
      const localHour = parseInt(
        new Date(l.checked_in_at).toLocaleString('en-US', {
          timeZone: 'Asia/Jerusalem',
          hour: 'numeric',
          hour12: false
        }),
        10
      );
      const h = isNaN(localHour) ? 0 : localHour % 24;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHoursChart = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: parseInt(hour),
      count
    }));

    // Weekly chart — using Palestine timezone (Asia/Jerusalem = UTC+3)
    const dayLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayCounts = {};
    dayLabels.forEach((d, i) => { dayCounts[i] = 0; });
    recentLogs.forEach(l => {
      const localDateStr = new Date(l.checked_in_at).toLocaleDateString('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short'
      });
      // Map abbreviated weekday to 0-6 (Sun=0)
      const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const day = weekdayMap[localDateStr] ?? new Date(l.checked_in_at).getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const weeklyChart = Object.entries(dayCounts).map(([day, count]) => ({
      day: parseInt(day),
      label: dayLabels[parseInt(day)],
      count
    }));

    // ── 4. Engagement rate — 1 batch query for recent workout users ──────────
    const { rows: recentWorkouts } = await db.pool.query(
      `SELECT DISTINCT ON (user_id) user_id, logged_at
       FROM workout_history
       WHERE logged_at >= $1
       ORDER BY user_id, logged_at DESC`,
      [sevenDaysAgoISO]
    );
    const workoutUserIds = new Set(recentWorkouts.map(w => w.user_id));
    const engagementRate = activeMembersCount > 0
      ? Math.round((workoutUserIds.size / activeMembersCount) * 100)
      : 0;

    // ── 5. At-risk members — 1 batch query for last check-in per member ──────
    const { rows: lastCheckins } = await db.pool.query(
      `SELECT DISTINCT ON (user_id) user_id, checked_in_at
       FROM attendance_logs
       ORDER BY user_id, checked_in_at DESC`
    );
    const lastCheckinMap = {};
    lastCheckins.forEach(l => { lastCheckinMap[l.user_id] = l.checked_in_at; });

    const atRiskMembers = [];
    for (const m of allMembers) {
      if (!activeMemberIds.has(m.id)) continue;
      const lastCI = lastCheckinMap[m.id];
      let atRisk = false;
      let lastCheckIn = null;
      if (lastCI) {
        lastCheckIn = new Date(lastCI);
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

    // ── 6. Smart Alerts (currently expired or expiring in 3 days or less) ──────
    const smartAlerts = [];
    for (const m of allMembers) {
      if (m.m_id) {
        const subStatus = m.sub_status;
        const endDate   = m.end_date;

        const daysLeft = getDaysDifference(endDate, todayStr);

        const isExpiredByDate     = daysLeft !== null && daysLeft < 0;
        const isExpired = isExpiredByDate || subStatus === 'expired' || m.status === 'expired';
        const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

        if (isExpired || isExpiringSoon) {
          smartAlerts.push({
            id: m.id,
            name: m.name,
            phone: m.phone,
            member_id: m.member_id,
            plan_name: m.plan_name || 'اشتراك شهري',
            end_date: m.end_date,
            days_left: daysLeft,
            status_type: isExpired ? 'expired' : 'warning'
          });
        }
      }
    }
    smartAlerts.sort((a, b) => {
      if (a.days_left === null && b.days_left !== null) return -1;
      if (a.days_left !== null && b.days_left === null) return 1;
      if (a.days_left === null && b.days_left === null) return 0;
      return a.days_left - b.days_left;
    });

    // ── 7. Live Activity Feed (latest check-ins, registrations, renewals) ─────
    const { rows: recentCheckinLogs } = await db.pool.query(
      `SELECT a.id, a.checked_in_at AS timestamp, u.id AS user_id, u.name AS user_name, u.member_id
       FROM attendance_logs a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.checked_in_at DESC
       LIMIT 10`
    );

    const { rows: recentRegLogs } = await db.pool.query(
      `SELECT id AS user_id, name AS user_name, member_id, created_at AS timestamp
       FROM users
       WHERE role = 'member'
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const { rows: recentSubLogs } = await db.pool.query(
      `SELECT m.id, m.start_date, m.user_id, u.name AS user_name, u.member_id, p.name AS plan_name
       FROM memberships m
       JOIN users u ON m.user_id = u.id
       LEFT JOIN subscription_plans p ON m.plan_id = p.id
       ORDER BY m.id DESC
       LIMIT 10`
    );

    const activityList = [];

    recentCheckinLogs.forEach(c => {
      activityList.push({
        id: `ci-${c.id}`,
        type: 'checkin',
        title: 'تسجيل حضور عضو',
        description: `تسجيل حضور المشترك [${c.user_name}] (${c.member_id})`,
        user_name: c.user_name,
        member_id: c.member_id,
        timestamp: c.timestamp
      });
    });

    recentRegLogs.forEach(r => {
      activityList.push({
        id: `reg-${r.user_id}`,
        type: 'registration',
        title: 'تسجيل مشترك جديد',
        description: `انضمام المشترك الجديد [${r.user_name}] (${r.member_id})`,
        user_name: r.user_name,
        member_id: r.member_id,
        timestamp: r.timestamp
      });
    });

    recentSubLogs.forEach(s => {
      activityList.push({
        id: `sub-${s.id}`,
        type: 'renewal',
        title: 'تفعيل/تجديد اشتراك',
        description: `تفعيل باقة [${s.plan_name || 'اشتراك'}] للمشترك [${s.user_name}]`,
        user_name: s.user_name,
        member_id: s.member_id,
        timestamp: s.start_date ? `${s.start_date}T10:00:00Z` : new Date().toISOString()
      });
    });

    activityList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentActivities = activityList.slice(0, 12);

    res.json({
      kpis: { activeMembersCount, attendanceTodayCount, monthlyRevenue, nearExpirationCount },
      peakHoursChart,
      weeklyChart,
      engagementRate,
      atRiskMembers,
      smartAlerts,
      recentActivities
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

// ─── NUTRITION & MEAL PLANS ──────────────────────────────────────────────────

// Get all nutrition plans (Public / Admin / Members)
app.get('/api/nutrition-plans', async (req, res) => {
  try {
    const plans = await db.getAllNutritionPlans();
    res.json(plans);
  } catch (err) {
    console.error('Failed to get nutrition plans:', err);
    res.status(500).json({ error: 'فشل جلب الأنظمة الغذائية' });
  }
});

// Admin: Create nutrition plan with meals
app.post('/api/nutrition-plans', requireRole(['admin']), async (req, res) => {
  const { title, goal, total_calories, meals_count, notes, meals } = req.body;
  if (!title || !goal) {
    return res.status(400).json({ error: 'الرجاء إدخال عنوان النظام والمستهدف الغذائي' });
  }
  try {
    const created = await db.createNutritionPlan({ title, goal, total_calories, meals_count, notes }, meals || []);
    res.status(201).json(created);
  } catch (err) {
    console.error('Failed to create nutrition plan:', err);
    res.status(500).json({ error: 'فشل إنشاء النظام الغذائي' });
  }
});

// Admin: Update nutrition plan
app.put('/api/nutrition-plans/:id', requireRole(['admin']), async (req, res) => {
  const { title, goal, total_calories, meals_count, notes, meals } = req.body;
  try {
    const updated = await db.updateNutritionPlan(req.params.id, { title, goal, total_calories, meals_count, notes }, meals || []);
    if (!updated) return res.status(404).json({ error: 'النظام الغذائي غير موجود' });
    res.json(updated);
  } catch (err) {
    console.error('Failed to update nutrition plan:', err);
    res.status(500).json({ error: 'فشل تحديث النظام الغذائي' });
  }
});

// Admin: Delete nutrition plan
app.delete('/api/nutrition-plans/:id', requireRole(['admin']), async (req, res) => {
  try {
    await db.deleteNutritionPlan(req.params.id);
    res.json({ message: 'تم حذف النظام الغذائي بنجاح' });
  } catch (err) {
    console.error('Failed to delete nutrition plan:', err);
    res.status(500).json({ error: 'فشل حذف النظام الغذائي' });
  }
});

// Member: Get active plan & available plans
app.get('/api/member/nutrition', requireRole(['member']), async (req, res) => {
  try {
    const activePlan = await db.getUserActiveNutritionPlan(req.user.id);
    const availablePlans = await db.getAllNutritionPlans();
    res.json({ activePlan, availablePlans });
  } catch (err) {
    console.error('Failed to get member nutrition:', err);
    res.status(500).json({ error: 'فشل جلب بيانات النظام الغذائي للمشترك' });
  }
});

// Member: Activate or change nutrition plan
app.post('/api/member/nutrition/activate', requireRole(['member']), async (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'الرجاء تحديد النظام الغذائي المراد تفعيله' });
  try {
    await db.setUserActiveNutritionPlan(req.user.id, plan_id);
    const activePlan = await db.getUserActiveNutritionPlan(req.user.id);
    res.json({ message: 'تم تفعيل النظام الغذائي بنجاح!', activePlan });
  } catch (err) {
    console.error('Failed to activate nutrition plan:', err);
    res.status(500).json({ error: 'فشل تفعيل النظام الغذائي' });
  }
});

// ─── SERVE FRONTEND ──────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../dist'), {
  maxAge: '1y',
  immutable: true,
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../dist/index.html'), err => {
    if (err) res.status(200).send('<h3>B2 Gym Backend is running. Use npm run dev for frontend.</h3>');
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.header("Access-Control-Allow-Origin", "https://b2-gym.com");
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

/**
 * server/db.cjs — Supabase PostgreSQL Database Layer
 * Uses 'pg' pool to interact with Supabase PostgreSQL.
 * All DB operations are async.
 * Password hashing: bcryptjs with SALT_ROUNDS = 10
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const { parse } = require('pg-connection-string');

const SALT_ROUNDS = 10;

// ─── CLEAR OVERRIDING PG ENV VARS ──────────────────────────────────────────
delete process.env.PGUSER;
delete process.env.POSTGRES_USER;
delete process.env.PGPASSWORD;
delete process.env.PGDATABASE;
delete process.env.PGHOST;
delete process.env.PGPORT;

// Clean connection string
let rawUrl = (process.env.DATABASE_URL || '').trim();
rawUrl = rawUrl.replace(/^["']+|["']+$|\s+/g, '');

const dbConfig = parse(rawUrl);

const parsedPassword = dbConfig.password ? decodeURIComponent(dbConfig.password.replace(/^["']+|["']+/g, '')) : '';

const poolConfig = {
  user: dbConfig.user ? dbConfig.user.replace(/^["']+|["']+/g, '') : '',
  password: parsedPassword,
  host: dbConfig.host,
  port: dbConfig.port ? parseInt(dbConfig.port, 10) : 5432,
  database: dbConfig.database,
  ssl: { rejectUnauthorized: false }
};

console.log(`DB Config -> Host: ${poolConfig.host}, User: ${poolConfig.user}, PassLen: ${poolConfig.password.length}`);

const pool = new Pool(poolConfig);

function getUTCNow() {
  return new Date().toISOString();
}

async function initDatabase() {
  console.log('🔄 Connecting to Supabase PostgreSQL and initializing schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        member_id VARCHAR(50) NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'monthly',
        price NUMERIC(10, 2) NOT NULL,
        duration_days INTEGER,
        sessions_count INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        sessions_remaining INTEGER,
        freeze_start_date VARCHAR(50),
        freeze_days_used INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        checked_in_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workout_unlocks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        unlock_date VARCHAR(50) NOT NULL,
        UNIQUE(user_id, unlock_date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exercise_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exercises (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES exercise_categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        video_url TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workout_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
        weight NUMERIC(10, 2),
        reps INTEGER,
        sets INTEGER,
        notes TEXT,
        logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Nutrition Tables ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_plans (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        goal VARCHAR(255) NOT NULL,
        total_calories INTEGER DEFAULT 2000,
        meals_count INTEGER DEFAULT 3,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meals (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER REFERENCES nutrition_plans(id) ON DELETE CASCADE,
        meal_name VARCHAR(255) NOT NULL,
        ingredients TEXT,
        calories INTEGER DEFAULT 0,
        protein INTEGER DEFAULT 0,
        carbs INTEGER DEFAULT 0,
        fats INTEGER DEFAULT 0,
        suggested_time VARCHAR(100)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_active_nutrition_plan (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES nutrition_plans(id) ON DELETE CASCADE,
        activated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default Nutrition Plans if none exist
    const { rows: existingPlans } = await client.query('SELECT 1 FROM nutrition_plans LIMIT 1');
    if (existingPlans.length === 0) {
      console.log('🌱 Seeding initial nutrition plans & meals...');
      
      // Plan 1: Bulking
      const { rows: p1 } = await client.query(
        `INSERT INTO nutrition_plans (title, goal, total_calories, meals_count, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['نظام تضخيم العضلات وزيادة الوزن', 'تضخيم وبناء عضل صافي', 2800, 4, 'يرجى شرب 3-4 لتر ماء يومياً والنوم 8 ساعات. تناول الوجبة المخصصة قبل التمرين بـ 90 دقيقة.']
      );
      const plan1Id = p1[0].id;
      await client.query(
        `INSERT INTO meals (plan_id, meal_name, ingredients, calories, protein, carbs, fats, suggested_time) VALUES
         ($1, 'وجبة الإفطار المشبعة', '100غ شوفان + 4 بيضات مسلوقة + 1 كوب حليب + 30غ مكسرات مشكلة + موزة', 700, 40, 80, 20, '08:00 صباحاً'),
         ($1, 'وجبة الغداء الرئيسية', '250غ صدر دجاج مشوي + 250غ أرز أبيض مسلوق + سلطة خضراء برشة زيت زيتون', 850, 55, 95, 15, '01:30 ظهراً'),
         ($1, 'وجبة قبل التمرين (الطاقة)', '2 قطعة خبز شوفان + 2 ملعقة زبدة فول سوداني + موزة كبيرة + رشة قرفة', 450, 15, 60, 15, '05:00 مساءً'),
         ($1, 'وجبة العشاء والبناء', '200غ سمك فيليه أو تونا بالماء + 200غ بطاطا حلوة مشوية + طبق سلطة خضراء', 800, 50, 75, 18, '09:00 مساءً')`,
        [plan1Id]
      );

      // Plan 2: Cutting
      const { rows: p2 } = await client.query(
        `INSERT INTO nutrition_plans (title, goal, total_calories, meals_count, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['نظام التنشيف وحرق الدهون', 'تخسيس وحرق دهون مع حفظ العضلات', 1900, 3, 'تقليل الصوديوم، شرب الماء بكثرة، وتناول السلطة مع ملعقة خل تفاح طبيعي قبل الغداء.']
      );
      const plan2Id = p2[0].id;
      await client.query(
        `INSERT INTO meals (plan_id, meal_name, ingredients, calories, protein, carbs, fats, suggested_time) VALUES
         ($1, 'إفطار بروتيني خفيف', '5 بياض بيض + 100غ جبن قريش + 50غ شوفان بالماء + خيار وطماطم', 450, 45, 40, 8, '08:30 صباحاً'),
         ($1, 'غداء التنشيف المتوازن', '200غ صدر دجاج مشوي + 150غ أرز بني مسلوق + خضار سوتيه (بروكلي وكوسة)', 650, 60, 55, 10, '02:00 ظهراً'),
         ($1, 'عشاء البروتين والريكفري', 'علبة تونا بالماء (180غ) + سلطة خضراء بدون زيت + 100غ زبادي يوناني لايت', 400, 45, 20, 6, '08:30 مساءً')`,
        [plan2Id]
      );
      console.log('✅ Initial nutrition plans & meals seeded successfully.');
    }

    // ── Performance indexes on frequently queried columns ──────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memberships_user_id
        ON memberships(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_user_id
        ON attendance_logs(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_checked_in_at
        ON attendance_logs(checked_in_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workout_history_user_id
        ON workout_history(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workout_unlocks_user_date
        ON workout_unlocks(user_id, unlock_date)
    `);

    // Seed default admin user ONLY if they do not exist
    const { rows: existingAdmins } = await client.query(
      "SELECT 1 FROM users WHERE role = 'admin' OR phone = $1 OR member_id = $2",
      ['0599988424', 'ADMIN']
    );
    if (existingAdmins.length === 0) {
      const hashedAdminPwd = await bcrypt.hash('123456', SALT_ROUNDS);
      await client.query(
        `INSERT INTO users (name, phone, password, role, member_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['مدير النادي', '0599988424', hashedAdminPwd, 'admin', 'ADMIN', 'active']
      );
      console.log('🌱 Seeded default admin user (password hashed).');
    } else {
      console.log('✔ Admin user already exists. Skipping seed.');
    }

    // Auto-migrate any unhashed plain-text passwords to bcrypt
    const { rows: unhashedUsers } = await client.query(
      "SELECT id, password FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2%'"
    );
    if (unhashedUsers.length > 0) {
      console.log(`🔒 Auto-migrating ${unhashedUsers.length} plain-text passwords to bcrypt...`);
      for (const u of unhashedUsers) {
        const hashed = await bcrypt.hash(String(u.password), SALT_ROUNDS);
        await client.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, u.id]);
      }
      console.log(`✅ Successfully hashed ${unhashedUsers.length} passwords.`);
    }

    await client.query('COMMIT');
    console.log('🌱 Database schema initialized/verified on Supabase.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ─── User functions ────────────────────────────────────────────────────────────

async function getAllUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return rows;
}

async function getMemberUsers() {
  const { rows } = await pool.query("SELECT * FROM users WHERE role = 'member' ORDER BY created_at DESC");
  return rows;
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getUserByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0] || null;
}

async function getUserByPhoneAndMemberId(phone, memberId) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE phone = $1 AND UPPER(member_id) = UPPER($2)',
    [phone, memberId]
  );
  return rows[0] || null;
}

async function getUserByPhoneAndPassword(phone, plainPassword) {
  // Fetch user by phone first, then compare hashed password
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE phone = $1',
    [phone]
  );
  const user = rows[0] || null;
  if (!user || !user.password) return null;
  const match = await bcrypt.compare(String(plainPassword), user.password);
  return match ? user : null;
}

async function getUserByMemberId(memberId) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE UPPER(member_id) = UPPER($1)',
    [memberId]
  );
  return rows[0] || null;
}

async function createUser(userData) {
  const now = getUTCNow();
  const tempMemberId = userData.member_id || `__TEMP__${Date.now()}`;
  const mustChange = userData.must_change_password === true;

  // Hash password if provided
  const hashedPassword = userData.password
    ? await bcrypt.hash(String(userData.password), SALT_ROUNDS)
    : null;

  const { rows } = await pool.query(
    `INSERT INTO users (name, phone, role, member_id, password, status, must_change_password, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userData.name,
      userData.phone,
      userData.role || 'member',
      tempMemberId,
      hashedPassword,
      userData.status || 'active',
      mustChange,
      now
    ]
  );

  let newUser = rows[0];

  // Auto-generate final member_id if none provided
  if (!userData.member_id) {
    const isStaff = ['admin', 'receptionist'].includes(userData.role);
    const prefix = isStaff ? 'STAFF' : 'MEM';
    const finalMemberId = `${prefix}${String(newUser.id).padStart(3, '0')}`;
    const updateRes = await pool.query(
      'UPDATE users SET member_id = $1 WHERE id = $2 RETURNING *',
      [finalMemberId, newUser.id]
    );
    newUser = updateRes.rows[0];
  }

  return newUser;
}

async function updateUser(id, updateData) {
  const user = await getUserById(id);
  if (!user) return null;
  const merged = { ...user, ...updateData };
  const mustChange = merged.must_change_password !== undefined ? merged.must_change_password : false;

  // If a new plain-text password is being set (only when it differs from current hash), re-hash it
  let finalPassword = merged.password;
  if (updateData.password && updateData.password !== user.password) {
    // Check if the incoming value is already a bcrypt hash (starts with $2)
    if (!String(updateData.password).startsWith('$2')) {
      finalPassword = await bcrypt.hash(String(updateData.password), SALT_ROUNDS);
    }
  }

  const { rows } = await pool.query(
    `UPDATE users SET name = $1, phone = $2, role = $3, member_id = $4, password = $5, status = $6, must_change_password = $7 WHERE id = $8 RETURNING *`,
    [merged.name, merged.phone, merged.role, merged.member_id, finalPassword, merged.status, mustChange, id]
  );
  return rows[0] || null;
}

// Dedicated helper: change password and clear the force-change flag atomically
async function changeUserPassword(id, newPassword) {
  const hashed = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  const { rows } = await pool.query(
    `UPDATE users SET password = $1, must_change_password = FALSE WHERE id = $2 RETURNING *`,
    [hashed, id]
  );
  return rows[0] || null;
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return true;
}

// ─── Subscription Plan functions ───────────────────────────────────────────────

async function getAllSubscriptionPlans() {
  const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY id ASC');
  return rows;
}

async function getSubscriptionPlanById(id) {
  const { rows } = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createSubscriptionPlan(data) {
  const isActive = data.is_active !== undefined ? !!data.is_active : true;
  const { rows } = await pool.query(
    `INSERT INTO subscription_plans (name, type, price, duration_days, sessions_count, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.name, data.type || 'monthly', data.price, data.duration_days || null, data.sessions_count || null, isActive]
  );
  return rows[0];
}

async function updateSubscriptionPlan(id, data) {
  const isActive = data.is_active !== undefined ? !!data.is_active : true;
  const { rows } = await pool.query(
    `UPDATE subscription_plans SET name = $1, type = $2, price = $3, duration_days = $4, sessions_count = $5, is_active = $6 WHERE id = $7 RETURNING *`,
    [data.name, data.type || 'monthly', data.price, data.duration_days || null, data.sessions_count || null, isActive, id]
  );
  return rows[0] || null;
}

async function deleteSubscriptionPlan(id) {
  await pool.query('DELETE FROM subscription_plans WHERE id = $1', [id]);
  return true;
}

// ─── Membership functions ──────────────────────────────────────────────────────

async function getSubscriptionByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT m.*, p.name as plan_name, p.type as plan_type, p.price as plan_price
     FROM memberships m
     LEFT JOIN subscription_plans p ON m.plan_id = p.id
     WHERE m.user_id = $1
     ORDER BY m.id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getAllActiveMemberships() {
  const { rows } = await pool.query(
    `SELECT m.*, u.name, u.phone, u.member_id, p.name as plan_name
     FROM memberships m
     LEFT JOIN users u ON m.user_id = u.id
     LEFT JOIN subscription_plans p ON m.plan_id = p.id
     WHERE m.status = 'active'`
  );
  return rows;
}

async function createMembership(data) {
  const { rows } = await pool.query(
    `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date, sessions_remaining)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.user_id, data.plan_id, data.status, data.start_date, data.end_date, data.sessions_remaining || null]
  );
  return rows[0];
}

async function updateMembership(id, data) {
  const existingRes = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
  const existing = existingRes.rows[0];
  if (!existing) return null;
  const merged = { ...existing, ...data };
  const { rows } = await pool.query(
    `UPDATE memberships SET status = $1, start_date = $2, end_date = $3, sessions_remaining = $4,
     freeze_start_date = $5, freeze_days_used = $6 WHERE id = $7 RETURNING *`,
    [merged.status, merged.start_date, merged.end_date, merged.sessions_remaining,
      merged.freeze_start_date || null, merged.freeze_days_used || 0, id]
  );
  return rows[0];
}

async function cancelMembership(membershipId) {
  await pool.query("UPDATE memberships SET status = 'inactive' WHERE id = $1", [membershipId]);
  return true;
}

// ─── Attendance functions ──────────────────────────────────────────────────────

async function getAttendanceLogs(limit = 100) {
  const { rows } = await pool.query(
    `SELECT a.*, u.name, u.member_id
     FROM attendance_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.checked_in_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getAttendanceByUserId(userId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT * FROM attendance_logs WHERE user_id = $1 ORDER BY checked_in_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function checkInUser(userId) {
  const { rows } = await pool.query(
    'INSERT INTO attendance_logs (user_id, checked_in_at) VALUES ($1, $2) RETURNING *',
    [userId, getUTCNow()]
  );
  return rows[0];
}

// ─── Workout Unlock (daily gate) ────────────────────────────────────────────────

async function unlockWorkoutForDay(userId, date) {
  try {
    await pool.query(
      'INSERT INTO workout_unlocks (user_id, unlock_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, date]
    );
    return true;
  } catch { return false; }
}

async function isWorkoutUnlockedForDay(userId, date) {
  const { rows } = await pool.query(
    'SELECT id FROM workout_unlocks WHERE user_id = $1 AND unlock_date = $2',
    [userId, date]
  );
  return rows.length > 0;
}

// ─── Exercise & Workout functions ─────────────────────────────────────────────

async function getAllExerciseCategories() {
  const { rows } = await pool.query('SELECT * FROM exercise_categories ORDER BY id ASC');
  return rows;
}

async function createExerciseCategory(name) {
  const { rows } = await pool.query(
    'INSERT INTO exercise_categories (name) VALUES ($1) RETURNING *',
    [name]
  );
  return rows[0];
}

async function deleteExerciseCategory(id) {
  await pool.query('DELETE FROM exercise_categories WHERE id = $1', [id]);
  return true;
}

async function getAllExercises() {
  const { rows } = await pool.query(
    `SELECT e.*, c.name as category_name
     FROM exercises e
     LEFT JOIN exercise_categories c ON e.category_id = c.id
     ORDER BY e.id ASC`
  );
  return rows;
}

async function getExercisesByCategory(categoryId) {
  const { rows } = await pool.query('SELECT * FROM exercises WHERE category_id = $1 ORDER BY id ASC', [categoryId]);
  return rows;
}

async function createExercise(data) {
  const { rows } = await pool.query(
    'INSERT INTO exercises (name, description, video_url, category_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.name, data.description || null, data.video_url || null, data.category_id]
  );
  return rows[0];
}

async function updateExercise(id, data) {
  const { rows } = await pool.query(
    'UPDATE exercises SET name = $1, description = $2, video_url = $3, category_id = $4 WHERE id = $5 RETURNING *',
    [data.name, data.description || null, data.video_url || null, data.category_id, id]
  );
  return rows[0] || null;
}

async function deleteExercise(id) {
  await pool.query('DELETE FROM exercises WHERE id = $1', [id]);
  return true;
}

async function getWorkoutHistory(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT w.*, e.name as exercise_name, e.description as exercise_description
     FROM workout_history w
     LEFT JOIN exercises e ON w.exercise_id = e.id
     WHERE w.user_id = $1
     ORDER BY w.logged_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function logWorkout(data) {
  const { rows } = await pool.query(
    `INSERT INTO workout_history (user_id, exercise_id, weight, reps, sets, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.user_id, data.exercise_id, data.weight || null, data.reps || null, data.sets || null, data.notes || null]
  );
  return rows[0];
}

async function deleteWorkoutLog(logId) {
  await pool.query('DELETE FROM workout_history WHERE id = $1', [logId]);
  return true;
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function getNotificationsForUser(userId) {
  const sub = await getSubscriptionByUserId(userId);
  const notifications = [];

  if (!sub) {
    notifications.push({
      id: 'no-sub',
      type: 'warning',
      title: 'لا يوجد اشتراك مفعّل',
      message: 'يرجى التواصل مع الاستقبال لتفعيل باقة الاشتراك الخاصة بك.'
    });
    return notifications;
  }

  const today = new Date().toISOString().split('T')[0];
  if (sub.end_date) {
    const daysLeft = Math.ceil((new Date(sub.end_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) {
      notifications.push({ id: 'expired', type: 'error', title: 'الاشتراك منتهي', message: 'انتهى اشتراكك. يرجى التواصل مع الاستقبال للتجديد.' });
    } else if (daysLeft <= 7) {
      notifications.push({ id: 'expiring', type: 'warning', title: `الاشتراك ينتهي خلال ${daysLeft} أيام`, message: `تاريخ انتهاء اشتراكك: ${sub.end_date}. يرجى التجديد قريباً.` });
    }
  }

  if (sub.status === 'frozen') {
    notifications.push({ id: 'frozen', type: 'info', title: 'الاشتراك مجمد', message: 'تم تجميد اشتراكك مؤقتاً. تواصل مع الاستقبال لإلغاء التجميد.' });
  }

  // Check if workout unlocked today
  const unlocked = await isWorkoutUnlockedForDay(userId, today);
  if (!unlocked && sub.status === 'active') {
    notifications.push({ id: 'unlock', type: 'info', title: 'التمارين مقفلة اليوم', message: 'مرر كود QR عند بوابة الدخول اليوم لفتح شاشة التمارين.' });
  }

  return notifications;
}

// ─── Nutrition Plans ─────────────────────────────────────────────────────────

async function getAllNutritionPlans() {
  const { rows: plans } = await pool.query('SELECT * FROM nutrition_plans ORDER BY id DESC');
  const { rows: meals } = await pool.query('SELECT * FROM meals ORDER BY id ASC');
  
  return plans.map(plan => ({
    ...plan,
    meals: meals.filter(m => m.plan_id === plan.id)
  }));
}

async function getNutritionPlanById(id) {
  const { rows: plans } = await pool.query('SELECT * FROM nutrition_plans WHERE id = $1', [id]);
  if (!plans[0]) return null;
  const { rows: meals } = await pool.query('SELECT * FROM meals WHERE plan_id = $1 ORDER BY id ASC', [id]);
  return { ...plans[0], meals };
}

async function createNutritionPlan(planData, mealsArray = []) {
  const { title, goal, total_calories, meals_count, notes } = planData;
  const { rows } = await pool.query(
    `INSERT INTO nutrition_plans (title, goal, total_calories, meals_count, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [title, goal, total_calories || 2000, meals_count || (mealsArray.length || 3), notes || null]
  );
  const newPlan = rows[0];
  const createdMeals = [];
  if (Array.isArray(mealsArray) && mealsArray.length > 0) {
    for (const m of mealsArray) {
      const { rows: mRows } = await pool.query(
        `INSERT INTO meals (plan_id, meal_name, ingredients, calories, protein, carbs, fats, suggested_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [newPlan.id, m.meal_name, m.ingredients || null, m.calories || 0, m.protein || 0, m.carbs || 0, m.fats || 0, m.suggested_time || null]
      );
      createdMeals.push(mRows[0]);
    }
  }
  return { ...newPlan, meals: createdMeals };
}

async function updateNutritionPlan(id, planData, mealsArray = []) {
  const { title, goal, total_calories, meals_count, notes } = planData;
  const { rows } = await pool.query(
    `UPDATE nutrition_plans
     SET title = $1, goal = $2, total_calories = $3, meals_count = $4, notes = $5
     WHERE id = $6 RETURNING *`,
    [title, goal, total_calories || 2000, meals_count || (mealsArray.length || 3), notes || null, id]
  );
  if (!rows[0]) return null;

  await pool.query('DELETE FROM meals WHERE plan_id = $1', [id]);
  const createdMeals = [];
  if (Array.isArray(mealsArray) && mealsArray.length > 0) {
    for (const m of mealsArray) {
      const { rows: mRows } = await pool.query(
        `INSERT INTO meals (plan_id, meal_name, ingredients, calories, protein, carbs, fats, suggested_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, m.meal_name, m.ingredients || null, m.calories || 0, m.protein || 0, m.carbs || 0, m.fats || 0, m.suggested_time || null]
      );
      createdMeals.push(mRows[0]);
    }
  }
  return { ...rows[0], meals: createdMeals };
}

async function deleteNutritionPlan(id) {
  await pool.query('DELETE FROM nutrition_plans WHERE id = $1', [id]);
  return true;
}

async function getUserActiveNutritionPlan(userId) {
  const { rows: activeRow } = await pool.query(
    `SELECT uap.*, np.title, np.goal, np.total_calories, np.meals_count, np.notes
     FROM user_active_nutrition_plan uap
     JOIN nutrition_plans np ON np.id = uap.plan_id
     WHERE uap.user_id = $1`,
    [userId]
  );
  if (!activeRow[0]) return null;
  const activePlan = activeRow[0];
  const { rows: meals } = await pool.query('SELECT * FROM meals WHERE plan_id = $1 ORDER BY id ASC', [activePlan.plan_id]);
  return { ...activePlan, meals };
}

async function setUserActiveNutritionPlan(userId, planId) {
  const { rows } = await pool.query(
    `INSERT INTO user_active_nutrition_plan (user_id, plan_id, activated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, activated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, planId]
  );
  return rows[0];
}

module.exports = {
  pool,
  initDatabase,
  getAllUsers,
  getMemberUsers,
  getUserById,
  getUserByPhone,
  getUserByMemberId,
  getUserByPhoneAndMemberId,
  getUserByPhoneAndPassword,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionByUserId,
  getAllActiveMemberships,
  createMembership,
  updateMembership,
  cancelMembership,
  getAttendanceLogs,
  getAttendanceByUserId,
  checkInUser,
  unlockWorkoutForDay,
  isWorkoutUnlockedForDay,
  getAllExerciseCategories,
  createExerciseCategory,
  deleteExerciseCategory,
  getAllExercises,
  getExercisesByCategory,
  createExercise,
  updateExercise,
  deleteExercise,
  getWorkoutHistory,
  logWorkout,
  deleteWorkoutLog,
  getNotificationsForUser,
  getAllNutritionPlans,
  getNutritionPlanById,
  createNutritionPlan,
  updateNutritionPlan,
  deleteNutritionPlan,
  getUserActiveNutritionPlan,
  setUserActiveNutritionPlan,
};

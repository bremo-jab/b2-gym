/**
 * server/db.cjs — Supabase PostgreSQL Database Layer
 * Uses 'pg' pool to interact with Supabase PostgreSQL.
 * All DB operations are async.
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');

const { parse } = require('pg-connection-string');

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

    // Seed default admin user ONLY if they do not exist
    const { rows: existingAdmins } = await client.query(
      "SELECT 1 FROM users WHERE role = 'admin' OR phone = $1 OR member_id = $2",
      ['0599988424', 'ADMIN']
    );
    if (existingAdmins.length === 0) {
      await client.query(
        `INSERT INTO users (name, phone, password, role, member_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['مدير النادي', '0599988424', '123456', 'admin', 'ADMIN', 'active']
      );
      console.log('🌱 Seeded default admin user.');
    } else {
      console.log('✔ Admin user already exists. Skipping seed.');
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

async function getUserByPhoneAndPassword(phone, password) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE phone = $1 AND password = $2',
    [phone, password]
  );
  return rows[0] || null;
}

async function createUser(userData) {
  const now = getUTCNow();
  const tempMemberId = userData.member_id || `__TEMP__${Date.now()}`;
  const mustChange = userData.must_change_password === true;

  const { rows } = await pool.query(
    `INSERT INTO users (name, phone, role, member_id, password, status, must_change_password, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userData.name,
      userData.phone,
      userData.role || 'member',
      tempMemberId,
      userData.password || null,
      userData.status || 'active',
      mustChange,
      now
    ]
  );

  let newUser = rows[0];

  // Auto-generate final member_id if none provided
  if (!userData.member_id) {
    // For staff accounts use STAFF prefix; members use MEM prefix
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
  const { rows } = await pool.query(
    `UPDATE users SET name = $1, phone = $2, role = $3, member_id = $4, password = $5, status = $6, must_change_password = $7 WHERE id = $8 RETURNING *`,
    [merged.name, merged.phone, merged.role, merged.member_id, merged.password, merged.status, mustChange, id]
  );
  return rows[0] || null;
}

// Dedicated helper: change password and clear the force-change flag atomically
async function changeUserPassword(id, newPassword) {
  const { rows } = await pool.query(
    `UPDATE users SET password = $1, must_change_password = FALSE WHERE id = $2 RETURNING *`,
    [newPassword, id]
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

module.exports = {
  pool,
  initDatabase,
  getAllUsers,
  getMemberUsers,
  getUserById,
  getUserByPhone,
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
};

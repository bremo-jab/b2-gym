require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function getUTCNow() {
  return new Date().toISOString();
}

async function initDatabase() {
  let retries = 5;
  let success = false;

  while (retries > 0 && !success) {
    try {
      console.log('🔌 Attempting to connect to Supabase PostgreSQL...');
      // Create tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NOT NULL UNIQUE,
          password VARCHAR(255),
          role VARCHAR(50) NOT NULL DEFAULT 'member',
          member_id VARCHAR(50) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subscription_plans (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'monthly',
          price NUMERIC(10, 2) NOT NULL,
          duration_days INTEGER,
          sessions_count INTEGER,
          is_active BOOLEAN NOT NULL DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS memberships (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          plan_id INTEGER REFERENCES subscription_plans(id),
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          sessions_remaining INTEGER
        );

        CREATE TABLE IF NOT EXISTS attendance_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS exercise_categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exercises (
          id SERIAL PRIMARY KEY,
          category_id INTEGER REFERENCES exercise_categories(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workout_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
          weight NUMERIC(10, 2),
          reps INTEGER,
          sets INTEGER,
          logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ All tables created!');

      // ── SAFE MIGRATIONS for existing tables ──
      // These run after CREATE TABLE IF NOT EXISTS and add columns
      // that may not exist on older table schemas in production.
      try {
        await pool.query(`
          ALTER TABLE subscription_plans
          ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'monthly';
        `);
        console.log('✅ Migrations applied (subscription_plans.type).');
      } catch (migrateErr) {
        // Log but don't crash — the column might already exist
        // or the ALTER may fail in some PostgreSQL versions.
        // The try/catch ensures the server still starts.
        console.log('⚠️ Migration note (non-fatal):', migrateErr.message);
      }

      try {
        await pool.query(`
          ALTER TABLE subscription_plans
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
        `);
        console.log('✅ Migrations applied (subscription_plans.is_active).');
      } catch (migrateErr) {
        console.log('⚠️ Migration note (non-fatal):', migrateErr.message);
      }

      // Seed admin and receptionist if users table is empty
      const { rows: userCount } = await pool.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCount[0].count) === 0) {
        await pool.query(`
          INSERT INTO users (name, phone, password, role, member_id)
          VALUES 
            ('خليفة', '0500000001', '889977', 'admin', 'ADMIN'),
            ('موظف الاستقبال', '0500000002', '123456', 'receptionist', 'RECEIPT')
          ON CONFLICT (member_id) DO NOTHING
        `);
        console.log('✅ Database seeded with admin and receptionist accounts.');
      }

      // Verify users exist
      const { rows } = await pool.query('SELECT id, name, phone, role, member_id FROM users ORDER BY id');
      console.log('\n👥 Current users in database:');
      rows.forEach(u => console.log(`  - ${u.name} (${u.member_id}, role: ${u.role}, phone: ${u.phone})`));

      console.log('\n✅ PostgreSQL database initialized successfully.');
      success = true;
    } catch (err) {
      retries--;
      console.error(`❌ Attempt ${5 - retries}/5 error initializing database:`, err.message);
      if (retries > 0) {
        console.log('⏳ Retrying in 2 seconds...');
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.error('❌ All retries exhausted!');
        throw err;
      }
    }
  }
}

// User functions
async function getAllUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return rows;
}

async function getMemberUsers() {
  const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', ['member']);
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
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1 AND member_id = $2', [phone, memberId]);
  return rows[0] || null;
}

async function getUserByPhoneAndPassword(phone, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, password]);
  return rows[0] || null;
}

async function createUser(userData) {
  const now = getUTCNow();
  const tempMemberId = userData.member_id || `__TEMP__${Date.now()}`;
  const { rows } = await pool.query(`
    INSERT INTO users (name, phone, role, member_id, password, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    userData.name,
    userData.phone,
    userData.role || 'member',
    tempMemberId,
    userData.password || null,
    now
  ]);
  const newUser = rows[0];

  // Auto-generate final member_id if needed
  if (!userData.member_id) {
    const finalMemberId = `MEM${String(newUser.id).padStart(3, '0')}`;
    const { rows: updated } = await pool.query('UPDATE users SET member_id = $1 WHERE id = $2 RETURNING *', [finalMemberId, newUser.id]);
    return updated[0];
  }
  return newUser;
}

async function updateUser(id, updateData) {
  const user = await getUserById(id);
  if (!user) return null;

  const merged = { ...user, ...updateData };
  const { rows } = await pool.query(`
    UPDATE users 
    SET name = $1, phone = $2, role = $3, member_id = $4, password = $5
    WHERE id = $6
    RETURNING *
  `, [merged.name, merged.phone, merged.role, merged.member_id, merged.password, id]);
  return rows[0];
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return true;
}

// Subscription Plan functions
async function getAllSubscriptionPlans() {
  const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY id ASC');
  return rows;
}

async function getActiveSubscriptionPlans() {
  const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY id ASC');
  return rows;
}

async function getSubscriptionPlanById(id) {
  const { rows } = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createSubscriptionPlan(data) {
  const { rows } = await pool.query(`
    INSERT INTO subscription_plans (name, type, price, duration_days, sessions_count, is_active)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [data.name, data.type || 'monthly', data.price, data.duration_days || null, data.sessions_count || null, data.is_active !== undefined ? data.is_active : true]);
  return rows[0];
}

async function updateSubscriptionPlan(id, data) {
  const { rows } = await pool.query(`
    UPDATE subscription_plans 
    SET name = $1, type = $2, price = $3, duration_days = $4, sessions_count = $5, is_active = $6
    WHERE id = $7
    RETURNING *
  `, [data.name, data.type || 'monthly', data.price, data.duration_days || null, data.sessions_count || null, data.is_active !== undefined ? data.is_active : true, id]);
  return rows[0];
}

async function deleteSubscriptionPlan(id) {
  await pool.query('DELETE FROM subscription_plans WHERE id = $1', [id]);
  return true;
}

// Membership functions (previously subscriptions)
async function getSubscriptionByUserId(userId) {
  const { rows } = await pool.query(`
    SELECT m.*, p.name as plan_name 
    FROM memberships m 
    LEFT JOIN subscription_plans p ON m.plan_id = p.id 
    WHERE m.user_id = $1 
    ORDER BY m.id DESC 
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

async function getAllActiveMemberships() {
  const { rows } = await pool.query(`
    SELECT m.*, u.name, u.phone, u.member_id, p.name as plan_name 
    FROM memberships m 
    LEFT JOIN users u ON m.user_id = u.id 
    LEFT JOIN subscription_plans p ON m.plan_id = p.id 
    WHERE m.status = 'active'
  `);
  return rows;
}

async function createMembership(data) {
  const { rows } = await pool.query(`
    INSERT INTO memberships (user_id, plan_id, status, start_date, end_date, sessions_remaining)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    data.user_id,
    data.plan_id,
    data.status,
    data.start_date,
    data.end_date,
    data.sessions_remaining
  ]);
  return rows[0];
}

async function updateMembership(id, data) {
  const { rows } = await pool.query(`
    UPDATE memberships 
    SET status = $1, start_date = $2, end_date = $3, sessions_remaining = $4
    WHERE id = $5
    RETURNING *
  `, [data.status, data.start_date, data.end_date, data.sessions_remaining, id]);
  return rows[0];
}

async function cancelMembership(membershipId) {
  await pool.query('UPDATE memberships SET status = $1 WHERE id = $2', ['inactive', membershipId]);
  return true;
}

// Attendance functions
async function getAttendanceLogs(limit = 100) {
  const { rows } = await pool.query(`
    SELECT a.*, u.name, u.member_id 
    FROM attendance_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    ORDER BY a.checked_in_at DESC 
    LIMIT $1
  `, [limit]);
  return rows;
}

async function getAttendanceByUserId(userId, limit = 100) {
  const { rows } = await pool.query(`
    SELECT * FROM attendance_logs 
    WHERE user_id = $1 
    ORDER BY checked_in_at DESC 
    LIMIT $2
  `, [userId, limit]);
  return rows;
}

async function getAttendanceStatsByUserId(userId, period) {
  const startDate = period === 'week' ? '7 days' : '1 month';
  const { rows } = await pool.query(`
    SELECT COUNT(*) as count 
    FROM attendance_logs 
    WHERE user_id = $1 AND checked_in_at >= NOW() - INTERVAL '${startDate}'
  `, [userId]);
  return { visits: parseInt(rows[0].count) };
}

async function checkInUser(userId) {
  const { rows } = await pool.query(`
    INSERT INTO attendance_logs (user_id)
    VALUES ($1)
    RETURNING *
  `, [userId]);
  return rows[0];
}

// Exercise & Workout functions
async function getAllExerciseCategories() {
  const { rows } = await pool.query('SELECT * FROM exercise_categories ORDER BY id ASC');
  return rows;
}

async function getAllExercises() {
  const { rows } = await pool.query('SELECT e.*, c.name as category_name FROM exercises e LEFT JOIN exercise_categories c ON e.category_id = c.id ORDER BY e.id ASC');
  return rows;
}

async function getExercisesByCategory(categoryId) {
  const { rows } = await pool.query('SELECT * FROM exercises WHERE category_id = $1 ORDER BY id ASC', [categoryId]);
  return rows;
}

async function createExerciseCategory(name) {
  const { rows } = await pool.query('INSERT INTO exercise_categories (name) VALUES ($1) RETURNING *', [name]);
  return rows[0];
}

async function deleteExerciseCategory(id) {
  await pool.query('DELETE FROM exercise_categories WHERE id = $1', [id]);
  return true;
}

async function createExercise(data) {
  const { rows } = await pool.query('INSERT INTO exercises (name, category_id) VALUES ($1, $2) RETURNING *', [data.name, data.category_id]);
  return rows[0];
}

async function deleteExercise(id) {
  await pool.query('DELETE FROM exercises WHERE id = $1', [id]);
  return true;
}

async function getAssignedWorkouts(memberId) {
  // For compatibility, return empty array since we removed member_workouts table
  return [];
}

async function assignWorkout(memberId, exerciseId, assignedBy) {
  // For compatibility
  return true;
}

async function removeAssignedWorkout(memberWorkoutId) {
  // For compatibility
  return true;
}

async function getWorkoutHistory(memberId, limit = 50) {
  const { rows } = await pool.query(`
    SELECT w.*, e.name as exercise_name 
    FROM workout_history w 
    LEFT JOIN exercises e ON w.exercise_id = e.id 
    WHERE w.user_id = $1 
    ORDER BY w.logged_at DESC 
    LIMIT $2
  `, [memberId, limit]);
  return rows;
}

async function logWorkout(data) {
  const { rows } = await pool.query(`
    INSERT INTO workout_history (user_id, exercise_id, weight, reps, sets)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [data.user_id, data.exercise_id, data.weight || null, data.reps || null, data.sets || null]);
  return rows[0];
}

async function deleteWorkoutLog(logId) {
  await pool.query('DELETE FROM workout_history WHERE id = $1', [logId]);
  return true;
}

// Export all functions
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
  deleteUser,
  getAllSubscriptionPlans,
  getActiveSubscriptionPlans,
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
  getAttendanceStatsByUserId,
  checkInUser,
  getAllExerciseCategories,
  getAllExercises,
  getExercisesByCategory,
  createExerciseCategory,
  deleteExerciseCategory,
  createExercise,
  deleteExercise,
  getAssignedWorkouts,
  assignWorkout,
  removeAssignedWorkout,
  getWorkoutHistory,
  logWorkout,
  deleteWorkoutLog
};

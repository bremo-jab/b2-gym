require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_USER = {
  name: 'خليفة',
  phone: '0500000001',
  password: '889977',
  role: 'admin',
  member_id: 'ADMIN'
};

async function resetDevelopmentDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      TRUNCATE TABLE
        attendance_logs,
        workout_history,
        exercises,
        exercise_categories,
        memberships,
        subscription_plans,
        users
      RESTART IDENTITY CASCADE;
    `);

    await client.query(`
      INSERT INTO users (name, phone, password, role, member_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (phone) DO UPDATE
        SET name = EXCLUDED.name,
            password = EXCLUDED.password,
            role = EXCLUDED.role,
            member_id = EXCLUDED.member_id
    `, [
      ADMIN_USER.name,
      ADMIN_USER.phone,
      ADMIN_USER.password,
      ADMIN_USER.role,
      ADMIN_USER.member_id
    ]);

    await client.query('COMMIT');

    const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS total_users FROM users');
    const { rows: users } = await client.query('SELECT id, name, phone, role, member_id FROM users ORDER BY id');

    console.log('\n✅ Database reset complete.');
    console.log(`👤 Total users remaining: ${countRows[0].total_users}`);
    console.log('\nRemaining users:');
    users.forEach(user => {
      console.log(`  - ${user.name} | ${user.member_id} | role=${user.role} | phone=${user.phone}`);
    });

    if (countRows[0].total_users !== 1) {
      throw new Error(`Expected exactly 1 user after reset, found ${countRows[0].total_users}`);
    }

    if (users[0]?.name !== ADMIN_USER.name || users[0]?.member_id !== ADMIN_USER.member_id) {
      throw new Error('Admin user was not restored correctly.');
    }

    console.log('\n✅ Verification passed: only the official admin account remains.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Reset failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDevelopmentDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});

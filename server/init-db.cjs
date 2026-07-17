require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTablesSQL = `
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
  price NUMERIC(10, 2) NOT NULL,
  duration_days INTEGER,
  sessions_count INTEGER
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
`;

const seedDataSQL = `
INSERT INTO users (name, phone, password, role, member_id)
VALUES 
  ('خليفة', '0500000001', '889977', 'admin', 'ADMIN'),
  ('موظف الاستقبال', '0500000002', '123456', 'receptionist', 'RECEIPT')
ON CONFLICT (member_id) DO NOTHING;
`;

async function initDB() {
  console.log('🔌 Attempting to connect to Supabase PostgreSQL...');
  let retries = 5;
  let connected = false;
  
  while (retries > 0 && !connected) {
    try {
      const client = await pool.connect();
      console.log('✅ Connected to Supabase PostgreSQL successfully!');
      
      console.log('📄 Creating database tables...');
      await client.query(createTablesSQL);
      console.log('✅ All tables created successfully!');
      
      console.log('🌱 Seeding admin and receptionist accounts...');
      await client.query(seedDataSQL);
      console.log('✅ Seeding complete!');
      
      const { rows } = await client.query('SELECT id, name, phone, role, member_id FROM users ORDER BY id');
      console.log('\n👥 Current users in database:');
      rows.forEach(u => console.log(`  - ${u.name} (${u.member_id}, role: ${u.role}, phone: ${u.phone})`));
      
      client.release();
      connected = true;
    } catch (err) {
      retries--;
      console.error(`❌ Failed attempt ${5 - retries}/5:`, err.message);
      if (retries > 0) {
        console.log(`⏳ Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.error('❌ All retry attempts failed!');
        process.exit(1);
      }
    }
  }
  
  await pool.end();
  console.log('\n✅ Database initialization complete!');
}

initDB();

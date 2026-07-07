const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const port = process.env.PORT || 8080;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'changeme',
  database: process.env.DB_NAME || 'appdb',
});

// Retry-friendly table init so the app doesn't crash if DB isn't ready yet
async function initDb(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('Database initialized');
      return;
    } catch (err) {
      console.log(`DB not ready yet (attempt ${i + 1}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('Could not connect to database after retries');
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend', env: process.env.ENVIRONMENT || 'unknown', version: 'v2' });
});

app.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/items', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query(
      'INSERT INTO items (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}, environment=${process.env.ENVIRONMENT || 'unknown'}`);
  initDb();
});

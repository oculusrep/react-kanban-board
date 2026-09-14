const { Pool } = require('pg');
require('dotenv').config();

// DATABASE_URL is loaded from .env
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const paymentId = '22ba622d-79f7-4d83-a082-87ada8c8ad3d';
    const newAmount = 9810;
    
    console.log('Attempting raw SQL UPDATE...');
    const result = await pool.query(
      'UPDATE payment SET payment_amount = $1, amount_override = true, override_at = NOW() WHERE id = $2 RETURNING payment_amount, amount_override',
      [newAmount, paymentId]
    );
    
    console.log('Update result:', result.rows);
    
    // Verify
    const verify = await pool.query(
      'SELECT payment_amount, amount_override FROM payment WHERE id = $1',
      [paymentId]
    );
    
    console.log('Verified:', verify.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
})();

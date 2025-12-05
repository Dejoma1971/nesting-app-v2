require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Transforma em Promises para podermos usar async/await
const promisePool = pool.promise();

console.log(`📡 Conectado ao MySQL: ${process.env.DB_NAME}`);

module.exports = promisePool;
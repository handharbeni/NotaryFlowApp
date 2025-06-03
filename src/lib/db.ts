
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config(); // Ensure environment variables are loaded

const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306,
  waitForConnections: true,
  connectionLimit: 10, // Adjust as needed
  queueLimit: 0,
  enableKeepAlive: true,       // Added to send keep-alive probes
  keepAliveInitialDelay: 30000, // Delay in milliseconds for the first keep-alive probe (30 seconds)
  // ssl: { // Uncomment and configure if your MySQL server uses SSL
  //   ca: process.env.MYSQL_SSL_CA,
  //   key: process.env.MYSQL_SSL_KEY,
  //   cert: process.env.MYSQL_SSL_CERT,
  //   rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' // Defaults to true
  // }
};

if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
  console.error('MySQL Database configuration is incomplete. Please check your .env file. Required: MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE. MYSQL_PASSWORD can be empty but is often required.');
  // In a real app, you might throw an error or have a fallback mechanism.
}

// Create a connection pool
// @ts-ignore filter out undefined ssl config
const pool = mysql.createPool(dbConfig.ssl?.ca ? dbConfig : {...dbConfig, ssl: undefined });

// Test connection during app startup (optional, but good for diagnostics)
pool.getConnection()
  .then(connection => {
    console.log('Successfully connected to MySQL database pool via src/lib/db.ts.');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to MySQL database pool from src/lib/db.ts:');
    console.error(`Message: ${err.message}`);
    // @ts-ignore
    if (err.sqlMessage) console.error(`SQL Message: ${err.sqlMessage}`);
    // @ts-ignore
    if (err.sqlState) console.error(`SQL State: ${err.sqlState}`);
    // @ts-ignore
    if (err.errno) console.error(`Error Number: ${err.errno}`);
    // Consider exiting or implementing a retry mechanism if critical for app startup
  });

export default pool;

const mysql = require("mysql2");
require("dotenv").config({ path: require('path').join(__dirname, '..', '.env') });

const db = mysql.createPool({
  host: process.env.DB_HOST || "MYSQL5045.site4now.net",
  user: process.env.DB_USER || "ac39fb_hrms",
  password: process.env.DB_PASSWORD || "Aadheesh@123",
  database: process.env.DB_NAME || "db_ac39fb_hrms",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0
});

module.exports = db.promise();
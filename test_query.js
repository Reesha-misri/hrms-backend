const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
  const db = await mysql.createPool({
    host: process.env.host,
    user: process.env.user,
    password: process.env.password,
    database: process.env.database
  });

  const employee_id = '1';
  const sql = `
    SELECT 
      e.employee_id,
      e.full_name,
      e.email,
      e.department_name,
      d.designation_title,
      r.role_name,
      m.full_name AS manager_name,
      e.communication_address,
      e.permanent_address,
      COALESCE(s.basic, 0) AS basic,
      COALESCE(s.allowance, 0) AS allowance,
      COALESCE(s.deduction, 0) AS deduction
    FROM employee e
    LEFT JOIN designation d ON e.designation_id = d.designation_id
    LEFT JOIN roles r ON e.role_id = r.role_id
    LEFT JOIN employee m ON e.manager_id = m.employee_id
    LEFT JOIN salary_structure s ON e.employee_id = s.employee_id
    WHERE e.employee_id = ?
  `;

  const [rows] = await db.execute(sql, [employee_id]);
  console.log("Result:", JSON.stringify(rows[0], null, 2));
  process.exit();
}

test();

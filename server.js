// server.js
require('dotenv').config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const { sendEmail } = require("./emailService");
   
const app = express();
app.use(cors());
app.use(express.json());

// 🔹 MySQL Connection
let db;

async function initDB() { 
  try {
    db = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "Admin@123", 
      database: "COMPANY",
    });

    console.log("✅ Connected to MySQL Database");

    // Start server after DB is ready
    app.listen(3001, () => console.log("🚀 Server running on port 3001"));
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}
initDB();

// 🔹 TEST ROUTE
app.get("/", (req, res) => res.send("Backend running"));

// 🔹 DESIGNATIONS
app.get("/designations", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM designation");
    res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 ROLES
app.get("/roles", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM roles");
    res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 EMPLOYEES with Role-Based Access
app.get("/employees", async (req, res) => {
  try {
    const { role, employee_id } = req.query; // get role & employee_id from frontend

    let sql = `
    SELECT 
      e.employee_id,
      e.full_name,
      e.email,
      e.department_name,
      e.communication_address,
      e.permanent_address,
      e.manager_id,
      e.designation_id,
      e.role_id,
      d.designation_title,
      r.role_name,
      m.full_name AS manager_name,
      COALESCE(s.basic,0) AS basic,
      COALESCE(s.allowance,0) AS allowance,
      COALESCE(s.deduction,0) AS deduction
    FROM employee e
    LEFT JOIN designation d ON e.designation_id = d.designation_id
    LEFT JOIN roles r ON e.role_id = r.role_id
    LEFT JOIN employee m ON e.manager_id = m.employee_id
    LEFT JOIN salary_structure s ON e.employee_id = s.employee_id
    `;

    if (role === "Employee") {
      sql += " WHERE e.employee_id = ?";
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else if (role === "Manager") {
      sql += " WHERE e.manager_id = ?";
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else {
      // Admin/HR sees all employees
      const [rows] = await db.execute(sql);
      console.log(rows);
      return res.json(rows);
    }

  } catch (err) {
    console.error("EMPLOYEES FETCH ERROR:", err);
    res.status(500).send("Database Error");
  }
});

app.post("/add-employee", async (req, res) => {
  try {
    const {
      employee_id,
      full_name,
      email,
      password, // added for login
      department_name,
      designation_id,
      role_id,
      manager_id,
      communication_address,
      permanent_address,
    } = req.body;

    // 1️⃣ Insert into employee table
    const [result] = await db.execute(
      `INSERT INTO employee
      (employee_id, full_name, email, department_name, designation_id, role_id, manager_id, communication_address, permanent_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, full_name, email, department_name, designation_id, role_id, manager_id || null, communication_address, permanent_address]
    );
    await db.execute(
      `INSERT INTO users (employee_id, email, password, role_id)
      VALUES (?, ?, ?, ?)`,
      [employee_id, email, "123456", role_id]
      );
    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [employee_id, "Employee Created"]
      );
    // create default leave balance
   await db.execute(
  "INSERT INTO leave_balance (employee_id) VALUES (?)",
  [employee_id]
  ); 



    // 2️⃣ Insert into users table for login
await db.execute(
  `INSERT INTO users (employee_id, email, password, role_id)
   VALUES (?, ?, ?, ?)`,
  [employee_id, email, password || "123456", role_id]
);
// After inserting employee and users
await db.execute(
  `INSERT INTO salary_structure (employee_id, basic, allowance, deduction)
   VALUES (?, ?, ?, ?)`,
  [employee_id, basic || 0, allowance || 0, deduction || 0]
);

    res.send("Employee added successfully with login");
  } catch (err) {
    console.error("ADD EMPLOYEE DB ERROR:", err);
    res.status(500).send("Database Error");
  }
});

// 🔹 UPDATE EMPLOYEE (with login update)
app.put("/update-employee/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      email,
      password, // added for login update
      department_name,
      designation_id,
      role_id,
      manager_id,
      communication_address,
      permanent_address,
    } = req.body;

    // 1️⃣ Update employee table
    await db.execute(
      `UPDATE employee SET full_name=?, email=?, department_name=?, designation_id=?, role_id=?, manager_id=?, communication_address=?, permanent_address=? WHERE employee_id=?`,
      [full_name, email, department_name, designation_id, role_id, manager_id || null, communication_address, permanent_address, id]
    );
    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?,?)",
      [id,"Employee Updated"]
      );

    // 2️⃣ Update users table for login
    await db.execute(
      `UPDATE users SET email=?,role_id=? WHERE employee_id=?`,
      [email,role_id,id]
    );
    await db.execute(
      `UPDATE salary_structure SET basic=?, allowance=?, deduction=? WHERE employee_id=?`,
      [basic || 0, allowance || 0, employee_id]
    );

    res.send("Employee updated successfully with login");
  } catch (err) {
    console.error("UPDATE EMPLOYEE DB ERROR:", err);
    res.status(500).send("Database Error");
  }
});

// 🔹 DELETE EMPLOYEE
app.delete("/delete-employee/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Log action first
    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [id, "Employee Deleted"]
    );

    // 2️⃣ Delete related records
    await db.execute("DELETE FROM users WHERE employee_id=?", [id]);
    await db.execute("DELETE FROM attendance WHERE employee_id=?", [id]);
    await db.execute("DELETE FROM leave_request WHERE employee_id=?", [id]);
    await db.execute("DELETE FROM payroll WHERE employee_id=?", [id]);
    await db.execute("DELETE FROM salary_structure WHERE employee_id=?", [id]);

    await db.execute(
      "DELETE FROM users WHERE employee_id=?",
      [id]
      );

    // 3️⃣ Delete employee
    await db.execute("DELETE FROM employee WHERE employee_id=?", [id]);

    res.send("Employee deleted successfully");

  } catch (err) {
    console.error("DELETE EMPLOYEE DB ERROR:", err);
    res.status(500).send("Database Error");
  }
});
// 🔹 LOGIN WITH ROLE & PERMISSIONS
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.execute(
      `SELECT u.employee_id, r.role_name, p.permission_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN role_permissions rp ON r.role_id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE u.email=? AND u.password=?`,
      [email, password]
    );

    if (rows.length === 0) {
      return res.status(401).send("Invalid login");
    }

    const employee_id = rows[0].employee_id;
    const role = rows[0].role_name;

    const permissions = rows
      .filter(r => r.permission_name)
      .map(r => ({ permission_name: r.permission_name }));

    res.json({
      employee_id,
      role,
      permissions
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});
// 🔹 ATTENDANCE
app.get("/attendance", async (req, res) => {
  try {
    const { role, employee_id, date } = req.query;
    let sql = "SELECT * FROM attendance";

    if (role === "Employee") {

      sql += " WHERE employee_id = ?";
    
      if (date) {
        sql += " AND attendance_date = ?";
        const [rows] = await db.execute(sql, [employee_id, date]);
        return res.json(rows);
      }
    
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    
  } else if (role === "Manager") {

    let sql = `
      SELECT a.*
      FROM attendance a
      JOIN employee e ON a.employee_id = e.employee_id
      WHERE e.manager_id = ?
    `;
  
    if (date) {
      sql += " AND a.attendance_date = ?";
      const [rows] = await db.execute(sql, [employee_id, date]);
      return res.json(rows);
    }
  
    const [rows] = await db.execute(sql, [employee_id]);
    return res.json(rows);
  } else {

    if (date) {
      sql += " WHERE attendance_date = ?";
      const [rows] = await db.execute(sql, [date]);
      return res.json(rows);
    }
  
    const [rows] = await db.execute(sql);
    return res.json(rows);
  }

  } catch (err) {
    res.status(500).send("Database Error");
  }
});


app.post("/checkin", async (req, res) => {
  try {
    const { employee_id } = req.body;
    const [existing] = await db.execute("SELECT * FROM attendance WHERE employee_id=? AND attendance_date=CURDATE()", [employee_id]);
    if (existing.length > 0) return res.send("Already checked in today");

    await db.execute("INSERT INTO attendance (employee_id, attendance_date, check_in, status) VALUES (?, CURDATE(), NOW(), 'Present')", [employee_id]);
    res.send("Check-in recorded");
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

app.put("/checkout/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute("UPDATE attendance SET check_out=NOW() WHERE employee_id=? AND attendance_date=CURDATE()", [id]);
    res.send("Check-out recorded");
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 LEAVE MANAGEMENT
app.get("/leaves", async (req, res) => {
  try {
    const [rows] = await db.execute(`
    SELECT l.*, e.full_name
    FROM leave_request l
    JOIN employee e
    ON l.employee_id = e.employee_id
    `);
        res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});
app.post("/apply-leave", async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason, leave_type } = req.body;

    if (!employee_id || !start_date || !end_date || !leave_type) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check for overlapping leave
    const [existing] = await db.execute(
      `SELECT * FROM leave_request WHERE employee_id=? 
       AND ((start_date BETWEEN ? AND ?) OR (end_date BETWEEN ? AND ?))`,
      [employee_id, start_date, end_date, start_date, end_date]
    );

    if (existing.length > 0) {
      return res.json({ error: "Leave already applied for these dates" });
    }

    // Check leave balance
    const [balance] = await db.execute(
      "SELECT remaining_leaves FROM leave_balance WHERE employee_id=?",
      [employee_id]
    );

    if (!balance.length || balance[0].remaining_leaves <= 0) {
      return res.json({ error: "No leave balance remaining" });
    }

    // Insert leave request
    await db.execute(
      `INSERT INTO leave_request (employee_id, leave_type, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [employee_id, leave_type, start_date, end_date, reason]
    );

    // Return newly inserted leave
    const [inserted] = await db.execute(
      "SELECT * FROM leave_request WHERE employee_id=? ORDER BY leave_id DESC LIMIT 1",
      [employee_id]
    );

    res.json({ message: "Leave applied successfully", leave: inserted[0] });
  } catch (err) {
    console.error("APPLY LEAVE DB ERROR:", err);
    res.status(500).json({ error: "Database Error" });
  }
});
app.put("/approve-leave/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const [leave] = await db.execute(
      "SELECT l.employee_id, l.start_date, l.end_date, e.email, e.full_name FROM leave_request l JOIN employee e ON l.employee_id = e.employee_id WHERE l.leave_id=?",
      [id]
    );

    const empId = leave[0].employee_id;
    const fromDate = leave[0].start_date;
    const toDate = leave[0].end_date;
    const empEmail = leave[0].email;
    const empName = leave[0].full_name;

    const diff = Math.ceil(
      (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)
    ) + 1;

    await db.execute(
      "UPDATE leave_request SET status='Approved' WHERE leave_id=?",
      [id]
    );

    await db.execute(
      "UPDATE leave_balance SET used_leaves = used_leaves + ?, remaining_leaves = remaining_leaves - ? WHERE employee_id=?",
      [diff, diff, empId]
    );

    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [empId, "Leave Approved"]
    );

    // Send Approval Email
    const subject = "Leave Request Approved";
    const text = `Hi ${empName}, your leave request from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} has been approved.`;
    const html = `<p>Hi <b>${empName}</b>,</p><p>Your leave request from <b>${new Date(fromDate).toLocaleDateString()}</b> to <b>${new Date(toDate).toLocaleDateString()}</b> has been <b>approved</b>.</p>`;
    
    sendEmail(empEmail, subject, text, html).catch(err => console.error("Failed to send approval email:", err));

    res.send("Leave Approved");

  } catch (err) {
    console.log(err);
    res.status(500).send("Database Error");
  }
});

app.put("/reject-leave/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const [leave] = await db.execute(
      "SELECT l.employee_id, l.start_date, l.end_date, e.email, e.full_name FROM leave_request l JOIN employee e ON l.employee_id = e.employee_id WHERE l.leave_id=?",
      [id]
    );

    const empId = leave[0].employee_id;
    const fromDate = leave[0].start_date;
    const toDate = leave[0].end_date;
    const empEmail = leave[0].email;
    const empName = leave[0].full_name;

    await db.execute(
      "UPDATE leave_request SET status='Rejected' WHERE leave_id=?",
      [id]
    );

    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?,?)",
      [empId,"Leave Rejected"]
    );

    // Send Rejection Email
    const subject = "Leave Request Rejected";
    const text = `Hi ${empName}, your leave request from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} has been rejected.`;
    const html = `<p>Hi <b>${empName}</b>,</p><p>Your leave request from <b>${new Date(fromDate).toLocaleDateString()}</b> to <b>${new Date(toDate).toLocaleDateString()}</b> has been <b>rejected</b>.</p>`;

    sendEmail(empEmail, subject, text, html).catch(err => console.error("Failed to send rejection email:", err));

    res.send("Leave Rejected");

  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 PAYROLL
app.get("/payroll", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM payroll");
    res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

app.post("/generate-payroll", async (req, res) => {
  try {
    const { employee_id, month } = req.body;
    const [rows] = await db.execute("SELECT basic, allowance, deduction FROM salary_structure WHERE employee_id=?", [employee_id]);
    if (rows.length === 0) return res.send("Salary structure not found");

    const total_salary = Number(rows[0].basic || 0) + Number(rows[0].allowance || 0) - Number(rows[0].deduction || 0);

    await db.execute("INSERT INTO payroll (employee_id, month, total_salary, generated_date) VALUES (?, ?, ?, CURDATE())",
      [employee_id, month, total_salary]);
      await db.execute(
        "INSERT INTO audit_log (employee_id, action) VALUES (?,?)",
        [employee_id,"Payroll Generated"]
        );
    res.send("Payroll generated");
  } catch (err) {
    res.status(500).send("Database Error");
  }
});
app.get("/employee/:id", async (req, res) => {
  try {
    const sql = `
      SELECT 
        e.employee_id,
        e.full_name,
        e.department_name,
        d.designation_title,
        e.communication_address,
        e.permanent_address
      FROM employee e
      LEFT JOIN designation d ON e.designation_id = d.designation_id
      WHERE e.employee_id = ?
    `;

    const [rows] = await db.execute(sql, [req.params.id]);
    res.json(rows[0]);

  } catch (err) {
    res.status(500).send("Database error");
  }
});
app.get("/leave-balance/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const [rows] = await db.execute(
      "SELECT employee_id, total_leaves, used_leaves, remaining_leaves FROM leave_balance WHERE employee_id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).send("Leave balance not found");
    }

    res.json(rows[0]);

  } catch (err) {
    res.status(500).send("Database Error");
  }
});
app.get("/audit-logs", async (req,res)=>{
  try{

    const [rows] = await db.execute(`
      SELECT 
        a.log_id,
        a.employee_id,
        e.full_name,
        a.action,
        a.log_time
      FROM audit_log a
      LEFT JOIN employee e
      ON a.employee_id = e.employee_id
      ORDER BY a.log_time DESC
    `);

    res.json(rows);

  }catch(err){
    res.status(500).send("Database Error");
  }
});
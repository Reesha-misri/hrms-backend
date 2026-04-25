// server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const { sendEmail } = require("./emailService");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:3000"].filter(Boolean);
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", (req, res) => res.send("OK"));
app.get("/api/test-forgot", (req, res) => res.send("Test route for forgot password exists"));

const path = require("path");

// 🔹 MySQL Connection
let db;

async function initDB() {
  try {
    const host = process.env.DB_HOST || "MYSQL5045.site4now.net";
    const user = process.env.DB_USER || "ac39fb_hrms";
    const password = process.env.DB_PASSWORD || "Aadheesh@123";
    const database = process.env.DB_NAME || "db_ac39fb_hrms";
    const port = process.env.DB_PORT || 3306;

    console.log("Connecting to:", host);
    db = mysql.createPool({
      host: host,
      user: user,
      password: password,
      database: database,
      port: port,
      waitForConnections: true,
      connectionLimit: 50,
      queueLimit: 0
    });

    // 🔹 Test connection immediately
    const conn = await db.getConnection();
    console.log("✅ Successfully connected to MySQL");
    conn.release();

    // Start server after DB is ready
    const serverPort = process.env.PORT || 3001;
    app.listen(serverPort, () => console.log(`🚀 Server running on port ${serverPort}`));
  } catch (err) {
    console.error("❌ DATABASE INITIALIZATION FAILED:", err);
    // Log more details for debugging
    console.error("Config used:", {
      host: process.env.DB_HOST || "MYSQL5045.site4now.net",
      user: process.env.DB_USER || "ac39fb_hrms",
      db: process.env.DB_NAME || "db_ac39fb_hrms"
    });
  }
}

// 🔹 SERVE FRONTEND (Added for combined hosting)
app.use(express.static(path.join(__dirname, "public")));


// 🔹 DESIGNATIONS
app.get("/api/designations", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM designation");
    res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 ROLES
app.get("/api/roles", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM roles");
    res.json(rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

app.post("/api/add-designation", async (req, res) => {
  try {
    const { designation_title } = req.body;
    const [result] = await db.execute("INSERT INTO designation (designation_title) VALUES (?)", [designation_title]);
    res.json({ designation_id: result.insertId });
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

app.post("/api/add-role", async (req, res) => {
  try {
    const { role_name } = req.body;
    const [result] = await db.execute("INSERT INTO roles (role_name) VALUES (?)", [role_name]);
    res.json({ role_id: result.insertId });
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 EMPLOYEES with Role-Based Access
app.get("/api/employees", async (req, res) => {
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
      return res.json(rows);
    }

  } catch (err) {
    console.error("EMPLOYEES FETCH ERROR:", err);
    res.status(500).send("Database Error");
  }
});

app.post("/api/add-employee", async (req, res) => {
  const connection = await db.getConnection(); // Get a connection for the transaction
  try {
    const {
      employee_id,
      full_name,
      email,
      password,
      department_name,
      designation_id,
      role_id,
      manager_id,
      communication_address,
      permanent_address,
      basic,
      allowance,
      deduction
    } = req.body;

    // 🔹 Input Sanitization: Convert empty strings to null for integer/optional fields
    const nid = designation_id === "" ? null : designation_id;
    const rid = role_id === "" ? null : role_id;
    const mid = manager_id === "" ? null : manager_id;
    const b = basic === "" ? 0 : basic;
    const a = allowance === "" ? 0 : allowance;
    const d = deduction === "" ? 0 : deduction;

    await connection.beginTransaction();
    console.log(`[START] Adding Employee ${employee_id}`);

    // 1️⃣ Insert into employee table
    await connection.execute(
      `INSERT INTO employee
      (employee_id, full_name, email, department_name, designation_id, role_id, manager_id, communication_address, permanent_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, full_name, email, department_name, nid, rid, mid, communication_address, permanent_address]
    );
    console.log("✅ Step 1: Employee table updated");

    // 2️⃣ Insert into users table
    await connection.execute(
      `INSERT INTO users (employee_id, email, password, role_id)
      VALUES (?, ?, ?, ?)`,
      [employee_id, email, password || "123456", rid]
    );
    console.log("✅ Step 2: Users table updated");

    // 3️⃣ Log action
    await connection.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [employee_id, "Employee Created"]
    );

    // 4️⃣ Create default leave balance
    await connection.execute(
      "INSERT INTO leave_balance (employee_id) VALUES (?)",
      [employee_id]
    );
    console.log("✅ Step 3: Leave balance created");

    // 5️⃣ Insert into salary structure
    await connection.execute(
      `INSERT INTO salary_structure (employee_id, basic, allowance, deduction)
       VALUES (?, ?, ?, ?)`,
      [employee_id, b, a, d]
    );
    console.log("✅ Step 4: Salary structure created");

    await connection.commit();
    console.log(`[COMMIT] Employee ${employee_id} added successfully`);
    res.send("Employee added successfully");

  } catch (err) {
    await connection.rollback();
    console.error("ADD EMPLOYEE TRANSACTION ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).send("Duplicate Entry: Employee ID or Email already exists.");
    }
    res.status(500).send(`Database Error: ${err.message}`);
  } finally {
    connection.release();
  }
});

// 🔹 UPDATE EMPLOYEE (with login update)
app.put("/api/update-employee/:id", async (req, res) => {
  const connection = await db.getConnection();
  const id = parseInt(req.params.id);
  try {
    const {
      full_name,
      email,
      password,
      department_name,
      designation_id,
      role_id,
      manager_id,
      communication_address,
      permanent_address,
      basic,
      allowance,
      deduction
    } = req.body;

    // 🔹 Input Sanitization: Convert empty strings to null for integer/optional fields
    const nid = designation_id === "" ? null : designation_id;
    const rid = role_id === "" ? null : role_id;
    const mid = manager_id === "" ? null : manager_id;
    const b = basic === "" ? 0 : basic;
    const a = allowance === "" ? 0 : allowance;
    const d = deduction === "" ? 0 : deduction;

    await connection.beginTransaction();
    console.log(`[START] Updating Employee ${id}`);

    // 1️⃣ Update employee table
    await connection.execute(
      `UPDATE employee SET full_name=?, email=?, department_name=?, designation_id=?, role_id=?, manager_id=?, communication_address=?, permanent_address=? WHERE employee_id=?`,
      [full_name, email, department_name, nid, rid, mid, communication_address, permanent_address, id]
    );
    console.log("✅ Step 1: Employee table updated");

    await connection.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [id, "Employee Updated"]
    );

    // 2️⃣ Update users table
    if (password) {
      await connection.execute(
        `UPDATE users SET email=?, role_id=?, password=? WHERE employee_id=?`,
        [email, rid, password, id]
      );
    } else {
      await connection.execute(
        `UPDATE users SET email=?, role_id=? WHERE employee_id=?`,
        [email, rid, id]
      );
    }
    console.log("✅ Step 2: Users table updated");

    // 3️⃣ Update salary structure
    console.log(`[Updating Salary] For Employee ${id}: basic=${b}, allowance=${a}, deduction=${d}`);
    const [salaryResult] = await connection.execute(
      `UPDATE salary_structure SET basic=?, allowance=?, deduction=? WHERE employee_id=?`,
      [b, a, d, id]
    );

    if (salaryResult.affectedRows === 0) {
      console.log("⚠️ Salary structure not found, creating new record...");
      await connection.execute(
        `INSERT INTO salary_structure (employee_id, basic, allowance, deduction) VALUES (?, ?, ?, ?)`,
        [id, b, a, d]
      );
    }
    console.log("✅ Step 3: Salary structure updated");

    await connection.commit();
    console.log(`[COMMIT] Employee ${id} updated successfully`);
    res.send("Employee updated successfully");

  } catch (err) {
    await connection.rollback();
    console.error("UPDATE EMPLOYEE TRANSACTION ERROR:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).send("Duplicate Entry: Email already exists for another user.");
    }
    res.status(500).send(`Database Error: ${err.message}`);
  } finally {
    connection.release();
  }
});

// 🔹 DELETE EMPLOYEE
app.delete("/api/delete-employee/:id", async (req, res) => {
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

    // 3️⃣ Delete employee
    await db.execute("DELETE FROM employee WHERE employee_id=?", [id]);

    res.send("Employee deleted successfully");

  } catch (err) {
    console.error("DELETE EMPLOYEE DB ERROR:", err);
    res.status(500).send("Database Error");
  }
});
// 🔹 LOGIN WITH ROLE & PERMISSIONS
app.post("/api/login", async (req, res) => {
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
app.get("/api/attendance", async (req, res) => {
  try {
    const { role, employee_id, date } = req.query;
    let sql = `
      SELECT a.*, e.full_name 
      FROM attendance a 
      JOIN employee e ON a.employee_id = e.employee_id
    `;

    if (role === "Employee") {
      sql += " WHERE a.employee_id = ?";
      if (date) {
        sql += " AND a.attendance_date = ?";
        const [rows] = await db.execute(sql, [employee_id, date]);
        return res.json(rows);
      }
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else if (role === "Manager") {
      sql += " WHERE e.manager_id = ?";
      if (date) {
        sql += " AND a.attendance_date = ?";
        const [rows] = await db.execute(sql, [employee_id, date]);
        return res.json(rows);
      }
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else {
      // HR/Admin
      if (date) {
        sql += " WHERE a.attendance_date = ?";
        const [rows] = await db.execute(sql, [date]);
        return res.json(rows);
      }
      const [rows] = await db.execute(sql);
      return res.json(rows);
    }
  } catch (err) {
    console.error("ATTENDANCE FETCH ERROR:", err);
    res.status(500).send("Database Error");
  }
});


app.post("/api/checkin", async (req, res) => {
  try {
    const { employee_id, date } = req.body;
    // Use provided date or fallback to server's CURDATE()
    const checkDate = date || new Date().toISOString().split('T')[0];

    const [existing] = await db.execute(
      "SELECT * FROM attendance WHERE employee_id=? AND attendance_date=?", 
      [employee_id, checkDate]
    );

    if (existing.length > 0) return res.send("Already checked in today");

    await db.execute(
      "INSERT INTO attendance (employee_id, attendance_date, check_in, status) VALUES (?, ?, NOW(), 'Present')", 
      [employee_id, checkDate]
    );
    res.send("Check-in recorded");
  } catch (err) {
    console.error("CHECKIN ERROR:", err);
    res.status(500).send("Database Error");
  }
});

app.put("/api/checkout/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    const checkDate = date || new Date().toISOString().split('T')[0];

    await db.execute(
      "UPDATE attendance SET check_out=NOW() WHERE employee_id=? AND attendance_date=?", 
      [id, checkDate]
    );
    res.send("Check-out recorded");
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    res.status(500).send("Database Error");
  }
});

// 🔹 LEAVE MANAGEMENT
app.get("/api/leaves", async (req, res) => {
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
app.post("/api/apply-leave", async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason, leave_type } = req.body;

    if (!employee_id || !start_date || !end_date || !leave_type) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check for overlapping leave (completely encompassing, starting within, or ending within)
    const [existing] = await db.execute(
      `SELECT * FROM leave_request WHERE employee_id=? AND status != 'Rejected'
       AND (? <= end_date AND ? >= start_date)`,
      [employee_id, start_date, end_date]
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
app.put("/api/approve-leave/:id", async (req, res) => {
  try {

    const { id } = req.params;
    const { approver_id } = req.body;

    const [leave] = await db.execute(
      "SELECT l.employee_id, l.start_date, l.end_date, e.email, e.full_name FROM leave_request l JOIN employee e ON l.employee_id = e.employee_id WHERE l.leave_id=?",
      [id]
    );

    if (!leave.length) return res.status(404).send("Leave request not found");

    const empId = leave[0].employee_id;

    if (Number(approver_id) === Number(empId)) {
      return res.status(400).send("Self-approval is not allowed");
    }

    const fromDate = leave[0].start_date;
    const toDate = leave[0].end_date;
    const empEmail = leave[0].email;
    const empName = leave[0].full_name;

    // Use UTC for accurate day calculations across timezones
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diff = Math.ceil(
      (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / (1000 * 60 * 60 * 24)
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

app.put("/api/reject-leave/:id", async (req, res) => {
  try {

    const { id } = req.params;
    const { approver_id } = req.body;

    const [leave] = await db.execute(
      "SELECT l.employee_id, l.start_date, l.end_date, e.email, e.full_name FROM leave_request l JOIN employee e ON l.employee_id = e.employee_id WHERE l.leave_id=?",
      [id]
    );

    if (!leave.length) return res.status(404).send("Leave request not found");

    const empId = leave[0].employee_id;

    if (Number(approver_id) === Number(empId)) {
      return res.status(400).send("Self-rejection is not allowed");
    }

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
      [empId, "Leave Rejected"]
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
app.get("/api/payroll", async (req, res) => {
  try {
    const { role, employee_id } = req.query;
    let sql = "SELECT * FROM payroll";

    if (role === "Employee") {
      sql += " WHERE employee_id = ?";
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else if (role === "Manager") {
      sql = `
        SELECT p.* FROM payroll p
        JOIN employee e ON p.employee_id = e.employee_id
        WHERE e.manager_id = ?
      `;
      const [rows] = await db.execute(sql, [employee_id]);
      return res.json(rows);
    } else {
      // HR/Admin see all
      const [rows] = await db.execute(sql);
      res.json(rows);
    }
  } catch (err) {
    console.error("PAYROLL FETCH ERROR:", err);
    res.status(500).send("Database Error");
  }
});

app.post("/api/generate-payroll", async (req, res) => {
  try {
    const { employee_id, month } = req.body;
    const [rows] = await db.execute("SELECT basic, allowance, deduction FROM salary_structure WHERE employee_id=?", [employee_id]);
    if (rows.length === 0) return res.send("Salary structure not found");

    const total_salary = Number(rows[0].basic || 0) + Number(rows[0].allowance || 0) - Number(rows[0].deduction || 0);

    await db.execute("INSERT INTO payroll (employee_id, month, total_salary, generated_date) VALUES (?, ?, ?, CURDATE())",
      [employee_id, month, total_salary]);
    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?,?)",
      [employee_id, "Payroll Generated"]
    );
    res.send("Payroll generated");
  } catch (err) {
    res.status(500).send("Database Error");
  }
});
app.get("/api/employee/:id", async (req, res) => {
  try {
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

    const [rows] = await db.execute(sql, [req.params.id]);
    res.json(rows[0]);

  } catch (err) {
    console.error("DEBUG: /employee/:id error:", err);
    res.status(500).send("Database error");
  }
});
app.get("/api/leave-balance/:id", async (req, res) => {
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
app.get("/api/audit-logs", async (req, res) => {
  try {

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

  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// 🔹 FORGOT PASSWORD
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    console.log(`[FORGOT PASSWORD] Attempt for email: ${email}`);

    // Check if user exists
    const [user] = await db.execute("SELECT * FROM users WHERE email=?", [email]);
    if (user.length === 0) {
      console.log(`[FORGOT PASSWORD] User not found: ${email}`);
      return res.status(404).send("User with this email does not exist");
    }

    const employee_id = user[0].employee_id;

    // Update password
    await db.execute("UPDATE users SET password=? WHERE email=?", [newPassword, email]);
    console.log(`[FORGOT PASSWORD] Password updated for employee_id: ${employee_id}`);

    // Log action
    await db.execute(
      "INSERT INTO audit_log (employee_id, action) VALUES (?, ?)",
      [employee_id, "Password Reset"]
    );

    res.send("Password updated successfully");
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).send("Database Error");
  }
});

// 🔹 CATCH-ALL ROUTE (Must be at the end)
// Serves the React app for any route that doesn't match an API
app.get(/.*/, (req, res) => {
  try {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Error: index.html not found in public folder");
    }
  } catch (err) {
    console.error("SPA ERROR:", err);
    res.status(500).send("Server Error loading SPA");
  }
});

initDB();



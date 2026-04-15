const db = require("../config/db");

exports.getStats = async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];

    // 1. Core Simple Stats (Existing)
    const [total] = await db.query(`SELECT COUNT(*) AS totalEmployees FROM employee`);
    const [present] = await db.query(`
      SELECT COUNT(DISTINCT employee_id) AS present
      FROM attendance
      WHERE attendance_date = ?
    `, [today]);
    const [absent] = await db.query(`
      SELECT COUNT(*) AS absent
      FROM employee
      WHERE employee_id NOT IN (
        SELECT employee_id 
        FROM attendance 
        WHERE attendance_date = ?
      )
    `, [today]);
    const [leave] = await db.query(`
      SELECT COUNT(*) AS onLeave
      FROM leave_request
      WHERE status = 'Approved'
      AND ? BETWEEN start_date AND end_date
    `, [today]);
    const [salary] = await db.query(`
      SELECT SUM(total_salary) AS totalSalary
      FROM payroll
      WHERE month = DATE_FORMAT(?, '%M')
    `, [today]);

    // 2. Attendance Trend (Last 7 Days)
    const [attendanceTrend] = await db.query(`
      SELECT attendance_date as date, COUNT(*) as count 
      FROM attendance 
      WHERE attendance_date >= DATE_SUB(?, INTERVAL 7 DAY) 
      GROUP BY attendance_date 
      ORDER BY attendance_date ASC
    `, [today]);

    // 3. Payroll Trend (Last 6 Months)
    const [payrollTrend] = await db.query(`
      SELECT month, SUM(total_salary) as total 
      FROM payroll 
      WHERE generated_date >= DATE_SUB(?, INTERVAL 6 MONTH)
      GROUP BY month, generated_date
      ORDER BY generated_date ASC
    `, [today]);

    // 4. Department Ranking
    const [deptRanking] = await db.query(`
      SELECT department_name as name, COUNT(*) as count 
      FROM employee 
      GROUP BY department_name 
      ORDER BY count DESC
    `);

    // 5. Leave Trend (Last 6 Months)
    const [leaveTrend] = await db.query(`
      SELECT DATE_FORMAT(start_date, '%M') as month, COUNT(*) as count 
      FROM leave_request 
      WHERE status = 'Approved' AND start_date >= DATE_SUB(?, INTERVAL 6 MONTH)
      GROUP BY month
    `, [today]);

    res.json({
      totalEmployees: total[0].totalEmployees,
      present: present[0].present,
      absent: absent[0].absent,
      onLeave: leave[0].onLeave,
      totalSalary: salary[0].totalSalary || 0,
      attendanceTrend,
      payrollTrend,
      deptRanking,
      leaveTrend
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
};
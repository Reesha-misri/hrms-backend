const nodemailer = require("nodemailer");

// For development, we'll use Ethereal (a fake SMTP service)
// In production, these should be replaced with real SMTP credentials
const createTransporter = async () => {
  // If environment variables are set, use them. Otherwise, fall back to Ethereal for dev.
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: "gmail", // You can change this to your provider or use host/port
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  // Fallback to Ethereal for development if no credentials provided
  let testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

const sendEmail = async (to, subject, text, html) => {
  try {
    const transporter = await createTransporter();

    const info = await transporter.sendMail({
      from: '"Employee Management System" <no-reply@ems.com>',
      to,
      subject,
      text,
      html,
    });

    console.log("Message sent: %s", info.messageId);
    // Preview only available when sending through an Ethereal account
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = { sendEmail };

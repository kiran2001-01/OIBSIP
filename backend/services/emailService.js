const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, html }) => {
  const emailHost = process.env.EMAIL_HOST;

  if (!emailHost) {
    console.log("Email service not configured. Skipping email send.");
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html
  });

  return { skipped: false };
};

module.exports = {
  sendEmail
};

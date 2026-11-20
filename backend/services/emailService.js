const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, html }) => {
  const emailHost = process.env.EMAIL_HOST?.trim();
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPassword = process.env.EMAIL_PASSWORD?.replace(/\s/g, "");

  if (!emailHost) {
    console.log("Email service not configured. Skipping email send.");
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: emailUser,
      pass: emailPassword
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

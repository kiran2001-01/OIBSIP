const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, html }) => {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  const emailHost = process.env.EMAIL_HOST?.trim();
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPassword = process.env.EMAIL_PASSWORD?.replace(/\s/g, "");

  if (resendApiKey) {
    if (!resendFrom) {
      throw new Error("RESEND_FROM must be configured when RESEND_API_KEY is set");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [to],
        subject,
        html
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Resend API request failed (${response.status}): ${details.slice(0, 300)}`);
    }

    return { skipped: false };
  }

  if (!emailHost) {
    console.log("Email service not configured. Skipping email send.");
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
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

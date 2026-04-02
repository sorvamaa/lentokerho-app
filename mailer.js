const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    if (!host) {
      console.warn('SMTP not configured — password reset emails will be logged to console');
      return null;
    }
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendPasswordReset(toEmail, resetUrl) {
  const t = getTransporter();
  const mailOptions = {
    from: process.env.SMTP_USER || 'noreply@lentokerho.net',
    to: toEmail,
    subject: 'Lentokerho.net — salasanan nollaus',
    text: `Hei,\n\nSait tämän viestin koska pyysit salasanan nollausta Lentokerho.net-sovelluksessa.\n\nNollaa salasanasi tästä linkistä:\n${resetUrl}\n\nLinkki on voimassa 1 tunnin.\n\nJos et pyytänyt salasanan nollausta, voit jättää tämän viestin huomiotta.\n\n— Hämeenkyrön lentokerho`,
    html: `<p>Hei,</p><p>Sait tämän viestin koska pyysit salasanan nollausta Lentokerho.net-sovelluksessa.</p><p><a href="${resetUrl}" style="background:#2E6DA4;color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;display:inline-block">Nollaa salasana</a></p><p>Linkki on voimassa 1 tunnin.</p><p>Jos et pyytänyt salasanan nollausta, voit jättää tämän viestin huomiotta.</p><p>— Hämeenkyrön lentokerho</p>`,
  };

  if (!t) {
    console.log('=== PASSWORD RESET EMAIL (SMTP not configured) ===');
    console.log('To:', toEmail);
    console.log('URL:', resetUrl);
    console.log('================================================');
    return true;
  }

  await t.sendMail(mailOptions);
  return true;
}

module.exports = { sendPasswordReset };

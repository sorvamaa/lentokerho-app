const nodemailer = require('nodemailer');

// Käytössä Resend SMTP-endpointin kautta:
//   SMTP_HOST=smtp.resend.com
//   SMTP_PORT=465
//   SMTP_SECURE=true
//   SMTP_USER=resend           (Resendillä kirjautumisnimi on aina "resend")
//   SMTP_PASS=re_xxx...        (Resendin API-avain)
//   SMTP_FROM="Pilottipolku <noreply@pilottipolku.fi>"   (verified sender)
// Jos SMTP_HOST puuttuu, mailit kirjoitetaan konsoliin (dev-fallback).

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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@pilottipolku.fi';
  const mailOptions = {
    from,
    to: toEmail,
    subject: 'Pilottipolku — salasanan nollaus',
    text: `Hei,\n\nSait tämän viestin koska pyysit salasanan nollausta Pilottipolku-sovelluksessa.\n\nNollaa salasanasi tästä linkistä:\n${resetUrl}\n\nLinkki on voimassa 1 tunnin.\n\nJos et pyytänyt salasanan nollausta, voit jättää tämän viestin huomiotta.\n\n— Pilottipolku`,
    html: `<p>Hei,</p><p>Sait tämän viestin koska pyysit salasanan nollausta Pilottipolku-sovelluksessa.</p><p><a href="${resetUrl}" style="background:#2E6DA4;color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;display:inline-block">Nollaa salasana</a></p><p>Tai kopioi linkki selaimeen:<br><code>${resetUrl}</code></p><p>Linkki on voimassa 1 tunnin.</p><p>Jos et pyytänyt salasanan nollausta, voit jättää tämän viestin huomiotta.</p><p>— Pilottipolku</p>`,
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

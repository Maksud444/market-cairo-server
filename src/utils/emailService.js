const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const sendVerificationApproved = async (email, name) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    await transporter.sendMail({
      from: `"MySouqify" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Identity Verification Approved ✓',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#16a34a;">Congratulations ${name}!</h2>
          <p>Your identity verification has been <strong>approved</strong>. You can now post listings on MySouqify.</p>
          <a href="${frontendUrl}/post" style="display:inline-block;padding:12px 24px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;margin-top:16px;">Post Your First Ad</a>
          <p style="margin-top:20px;color:#666;">Thank you for being a trusted member of our community!</p>
        </div>
      `
    });
    console.log('[EMAIL] Verification approved email sent to:', email);
  } catch (error) {
    console.error('[EMAIL] Failed to send approval email:', error.message);
  }
};

const sendVerificationRejected = async (email, name, reason) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    await transporter.sendMail({
      from: `"MySouqify" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Identity Verification - Action Required',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">Hello ${name},</h2>
          <p>Unfortunately, your identity verification could not be approved.</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
            <strong>Reason:</strong> ${reason}
          </div>
          <p>You can submit new documents for verification:</p>
          <a href="${frontendUrl}/verify" style="display:inline-block;padding:12px 24px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">Submit New Documents</a>
          <p style="margin-top:20px;color:#666;">Please ensure your documents are clear, valid, and match our requirements.</p>
        </div>
      `
    });
    console.log('[EMAIL] Verification rejected email sent to:', email);
  } catch (error) {
    console.error('[EMAIL] Failed to send rejection email:', error.message);
  }
};

const sendListingApproved = async (email, name, listingTitle) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    await transporter.sendMail({
      from: `"MySouqify" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: `Your listing "${listingTitle}" is now live!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#16a34a;">Great news ${name}!</h2>
          <p>Your listing <strong>"${listingTitle}"</strong> has been approved and is now visible to buyers.</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;margin-top:16px;">View Your Listings</a>
          <p style="margin-top:20px;color:#666;">Good luck with your sale!</p>
        </div>
      `
    });
    console.log('[EMAIL] Listing approved email sent to:', email);
  } catch (error) {
    console.error('[EMAIL] Failed to send listing approval email:', error.message);
  }
};

const sendListingRejected = async (email, name, listingTitle, reason) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    await transporter.sendMail({
      from: `"MySouqify" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: `Listing "${listingTitle}" - Action Required`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">Hello ${name},</h2>
          <p>Your listing <strong>"${listingTitle}"</strong> could not be approved.</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
            <strong>Reason:</strong> ${reason || 'Policy violation'}
          </div>
          <p>You can edit and resubmit your listing:</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">Go to Dashboard</a>
        </div>
      `
    });
    console.log('[EMAIL] Listing rejected email sent to:', email);
  } catch (error) {
    console.error('[EMAIL] Failed to send listing rejection email:', error.message);
  }
};

module.exports = { sendVerificationApproved, sendVerificationRejected, sendListingApproved, sendListingRejected };

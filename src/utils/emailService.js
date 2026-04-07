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

const sendAdminNewListing = async (adminEmails, listing, sellerName, isRepost = false) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const adminPanelUrl = `${frontendUrl}/cp-x4m9k2/listings?moderation=pending`;
  const subject = isRepost
    ? `🔄 Repost for Review: "${listing.title}"`
    : `📋 New Listing Pending Approval: "${listing.title}"`;

  const badgeColor = isRepost ? '#f59e0b' : '#3b82f6';
  const badgeText = isRepost ? 'REPOST' : 'NEW';
  const headingText = isRepost
    ? `A listing has been resubmitted for review`
    : `A new listing is waiting for your approval`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
      <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">${badgeText}</span>
          <h2 style="margin:0;color:#111827;font-size:18px;">${headingText}</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Title</td><td style="padding:8px 0;font-weight:600;color:#111827;">${listing.title}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px;color:#6b7280;font-size:13px;">Seller</td><td style="padding:8px;color:#111827;">${sellerName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Category</td><td style="padding:8px 0;color:#111827;">${listing.category}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px;color:#6b7280;font-size:13px;">Type</td><td style="padding:8px;color:#111827;">${listing.isRent ? 'Rent' : listing.isDonation ? 'Donation' : 'Sale'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Price</td><td style="padding:8px 0;color:#111827;">${listing.isDonation ? 'FREE' : listing.isRent ? `${listing.pricePerDay} EGP/day` : `${listing.price} EGP`}</td></tr>
        </table>
        <a href="${adminPanelUrl}" style="display:inline-block;padding:13px 28px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Review in Admin Panel →</a>
        <p style="margin-top:20px;color:#9ca3af;font-size:12px;">You are receiving this because you are an admin on MySouqify.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"MySouqify Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: Array.isArray(adminEmails) ? adminEmails.join(',') : adminEmails,
      subject,
      html
    });
    console.log('[EMAIL] Admin new listing notification sent');
  } catch (error) {
    console.error('[EMAIL] Failed to send admin new listing email:', error.message);
  }
};

const sendPasswordReset = async (email, name, resetUrl) => {
  try {
    await transporter.sendMail({
      from: `"MySouqify" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#E00000;">Password Reset</h2>
          <p>Hello ${name},</p>
          <p>You requested a password reset. Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#E00000;color:#fff;text-decoration:none;border-radius:8px;margin-top:16px;">Reset Password</a>
          <p style="margin-top:20px;color:#666;">If you didn't request this, please ignore this email.</p>
          <p style="color:#999;font-size:12px;">Link: ${resetUrl}</p>
        </div>
      `
    });
    console.log('[EMAIL] Password reset email sent to:', email);
  } catch (error) {
    console.error('[EMAIL] Failed to send password reset email:', error.message);
  }
};

module.exports = { sendVerificationApproved, sendVerificationRejected, sendListingApproved, sendListingRejected, sendPasswordReset, sendAdminNewListing };

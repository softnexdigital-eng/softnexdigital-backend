const nodemailer = require("nodemailer");

let transporter = null;

// Initialize email transporter if SMTP configuration is available and valid
const smtpPass = process.env.SMTP_PASS || "";
const hasValidSmtpConfig =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  smtpPass &&
  !smtpPass.includes("your-16-character") &&
  !smtpPass.includes("placeholder") &&
  smtpPass.length > 5;

if (hasValidSmtpConfig) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass,
    },
  });
}

/**
 * Send OTP via email (Phase 1 functionality)
 * @param {string} email - Recipient email
 * @param {string} otp - OTP code
 */
async function sendOtpEmail(email, otp) {
  try {
    if (!transporter) {
      // If email not configured, log to console
      console.log(`
        ╔════════════════════════════════════════╗
        ║         OTP VERIFICATION CODE          ║
        ╠════════════════════════════════════════╣
        ║  Email: ${email.padEnd(35)} ║
        ║  OTP:   ${otp.padEnd(35)} ║
        ║  Valid for 5 minutes                   ║
        ╚════════════════════════════════════════╝
      `);
      return true;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Your OTP Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>OTP Verification Code</h2>
          <p>Your One-Time Password (OTP) for registration is:</p>
          <div style="background-color: #f0f0f0; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="letter-spacing: 5px; color: #333; margin: 0;">${otp}</h1>
          </div>
          <p>This code is valid for 5 minutes only. Do not share this code with anyone.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply to this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✓ OTP sent to", email);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
    // Still return true to allow user to try verification with console-logged OTP
    return true;
  }
}

/**
 * Generate rich HTML invoice matching admin panel design
 * @param {Object} order - Full order object with items, tenant
 * @param {Object} tenant - Tenant settings for store info
 * @returns {string} HTML invoice content
 */
function generateInvoiceHtml(order, tenant) {
  const storeName = tenant?.companyName || tenant?.name || "Store";
  const currencySymbol = tenant?.currencySymbol || "৳";
  const logo = tenant?.logo || "";
  const storePhone = tenant?.phone || "";
  const storeEmail = tenant?.tenantEmail || tenant?.email || "";
  const storeAddress = tenant?.address || "";

  const formatCurrency = (amount) => `${currencySymbol}${Number(amount).toFixed(2)}`;

  const itemsHtml = order.items
    ?.map(
      (item) => `
      <tr>
        <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 600; font-size: 14px;">${item.variant?.sku || "Product"}</div>
          <div style="font-size: 12px; color: #666;">${item.quantity} × ${formatCurrency(item.priceAtTime)}</div>
        </td>
        <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${formatCurrency(item.total)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background: #f4f7f9; font-family: 'Segoe UI', Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f7f9; padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #2D7A3A, #1B5E27); padding: 30px 40px; text-align: center;">
                  ${logo ? `<img src="${logo}" alt="${storeName}" style="height: 60px; width: auto; margin-bottom: 10px;" />` : ""}
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${storeName}</h1>
                  <p style="color: #a0f0b0; margin: 5px 0 0 0; font-size: 14px;">Order Invoice / অর্ডার চালান</p>
                </td>
              </tr>

              <!-- Order Info -->
              <tr>
                <td style="padding: 25px 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #f8fafc;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 50%;">
                                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong style="color: #1e293b;">Order:</strong> ${order.orderNumber}</p>
                                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong style="color: #1e293b;">Date:</strong> ${new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong style="color: #1e293b;">Status:</strong> <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${order.status}</span></p>
                              </td>
                              <td style="width: 50%;">
                                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong style="color: #1e293b;">Payment:</strong> ${order.paymentStatus}</p>
                              </td>
                            </tr>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Customer Info -->
              <tr>
                <td style="padding: 0 40px 25px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <h3 style="color: #1e293b; font-size: 15px; margin: 0 0 10px 0; border-bottom: 2px solid #2D7A3A; padding-bottom: 5px;">Customer Details</h3>
                        <p style="margin: 3px 0; font-size: 13px; color: #475569;"><strong>Name:</strong> ${order.customerName}</p>
                        <p style="margin: 3px 0; font-size: 13px; color: #475569;"><strong>Phone:</strong> ${order.customerPhone}</p>
                        ${order.customerEmail ? `<p style="margin: 3px 0; font-size: 13px; color: #475569;"><strong>Email:</strong> ${order.customerEmail}</p>` : ""}
                        ${order.customerAddress ? `<p style="margin: 3px 0; font-size: 13px; color: #475569;"><strong>Address:</strong> ${order.customerAddress}</p>` : ""}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Order Items -->
              <tr>
                <td style="padding: 0 40px 25px;">
                  <h3 style="color: #1e293b; font-size: 15px; margin: 0 0 10px 0; border-bottom: 2px solid #2D7A3A; padding-bottom: 5px;">Order Items</h3>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                    <thead>
                      <tr style="background: #f1f5f9;">
                        <th style="padding: 10px 4px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Product</th>
                        <th style="padding: 10px 4px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- Summary -->
              <tr>
                <td style="padding: 0 40px 25px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="right">
                        <table role="presentation" style="width: 280px;" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 4px 0;"><span style="color: #475569; font-size: 14px;">Subtotal</span></td>
                            <td style="padding: 4px 0; text-align: right; font-size: 14px;">${formatCurrency(order.subtotal)}</td>
                          </tr>
                          <tr>
                            <td style="padding: 4px 0;"><span style="color: #475569; font-size: 14px;">Delivery Charge</span></td>
                            <td style="padding: 4px 0; text-align: right; font-size: 14px;">${formatCurrency(order.deliveryCharge || 0)}</td>
                          </tr>
                          ${order.discount && order.discount > 0 ? `
                          <tr>
                            <td style="padding: 4px 0;"><span style="color: #475569; font-size: 14px;">Discount</span></td>
                            <td style="padding: 4px 0; text-align: right; font-size: 14px; color: #16a34a;">-${formatCurrency(order.discount)}</td>
                          </tr>` : ""}
                          <tr>
                            <td style="padding: 8px 0; border-top: 2px solid #1e293b;">
                              <strong style="font-size: 18px; color: #1e293b;">Total</strong>
                            </td>
                            <td style="padding: 8px 0; border-top: 2px solid #1e293b; text-align: right;">
                              <strong style="font-size: 18px; color: #2D7A3A;">${formatCurrency(order.total)}</strong>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                  ${storePhone ? `<p style="margin: 3px 0; font-size: 13px; color: #475569;">📞 ${storePhone}</p>` : ""}
                  ${storeEmail ? `<p style="margin: 3px 0; font-size: 13px; color: #475569;">✉️ ${storeEmail}</p>` : ""}
                  ${storeAddress ? `<p style="margin: 3px 0; font-size: 13px; color: #475569;">📍 ${storeAddress}</p>` : ""}
                  <p style="margin: 15px 0 0 0; font-size: 14px; color: #2D7A3A; font-weight: 700;">Thank you for your order! ❤️</p>
                  <p style="margin: 5px 0 0 0; font-size: 12px; color: #94a3b8;">We hope to see you again soon.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Send invoice email to customer with rich HTML design
 * @param {string} customerEmail - Customer's email
 * @param {Object} order - Full order object with items
 * @param {Object} tenant - Tenant settings
 * @param {string} frontendUrl
 */
async function sendInvoiceToCustomer(customerEmail, order, tenant, frontendUrl = process.env.FRONTEND_URL || "https://softnexdigital-frontend.vercel.app") {
  if (!customerEmail) return true;
  try {
    const html = generateInvoiceHtml(order, tenant);
    const subject = `Order Invoice - ${order.orderNumber} from ${tenant?.companyName || tenant?.name || "Store"}`;

    if (!transporter) {
      console.log(`📧 [DEV] Invoice email to ${customerEmail}: ${order.orderNumber}`);
      console.log(`📧 [DEV] Invoice HTML (first 200 chars): ${html.substring(0, 200)}...`);
      return true;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: customerEmail,
      subject,
      html,
    });
    console.log(`✓ Invoice email sent to ${customerEmail} for order ${order.orderNumber}`);
    return true;
  } catch (error) {
    console.error("Error sending invoice email:", error.message);
    return false;
  }
}

/**
 * Send notification to business admin when a new order is placed (Phase 4)
 * @param {string} adminEmail - Tenant's email address
 * @param {Object} order - Order object with id, orderNumber, customerName, total, etc.
 * @param {string} frontendUrl - Base URL for frontend (e.g., softnexdigital-frontend.vercel.app/)
 */
async function sendNewOrderEmail(adminEmail, order, frontendUrl = process.env.FRONTEND_URL || "https://softnexdigital-frontend.vercel.app") {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>🛒 New Order Placed</h2>
        <p><strong>Order #:</strong> ${order.orderNumber}</p>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Phone:</strong> ${order.customerPhone}</p>
        <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        <a href="${frontendUrl}/orders/${order.id}" style="background: #28a745; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px;">View Order</a>
        <hr>
        <p style="color: #666;">This is an automated notification.</p>
      </div>
    `;
    if (!transporter) {
      console.log(`📧 [DEV] New order email to ${adminEmail}: ${order.orderNumber}`);
      return true;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: adminEmail,
      subject: `New Order ${order.orderNumber}`,
      html,
    });
    console.log(`✓ New order email sent to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error("Error sending new order email:", error.message);
    return false;
  }
}

/**
 * Send order status update to customer (if email provided)
 * @param {string} customerEmail - Customer's email address
 * @param {string} orderNumber
 * @param {string} newStatus
 * @param {string} frontendUrl
 */
async function sendOrderStatusEmail(customerEmail, orderNumber, newStatus, frontendUrl = process.env.FRONTEND_URL || "https://softnexdigital-frontend.vercel.app") {
  if (!customerEmail) return true;
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>📦 Order Status Update</h2>
        <p>Your order <strong>${orderNumber}</strong> is now: <strong>${newStatus}</strong></p>
        <a href="${frontendUrl}/track-order/${orderNumber}" style="background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px;">Track Order</a>
        <hr>
        <p>Thank you for shopping with us.</p>
      </div>
    `;
    if (!transporter) {
      console.log(`📧 [DEV] Status update email to ${customerEmail}: ${orderNumber} -> ${newStatus}`);
      return true;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: customerEmail,
      subject: `Order ${orderNumber} updated to ${newStatus}`,
      html,
    });
    console.log(`✓ Status email sent to ${customerEmail}`);
    return true;
  } catch (error) {
    console.error("Error sending status email:", error.message);
    return false;
  }
}

/**
 * Helper to generate order number (used by controllers)
 * @param {string} tenantId
 * @param {PrismaClient} prisma
 * @returns {Promise<string>}
 */
async function generateOrderNumber(tenantId, prisma) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const newCounter = tenant.orderCounter + 1;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderCounter: newCounter },
  });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${dateStr}-${String(newCounter).padStart(4, '0')}`;
}

/**
 * Send refund notification email to 
 * @param {string} customerEmail
 * @param {string} orderNumber
 * @param {number} refundAmount
 * @param {string} frontendUrl
 */
async function sendRefundEmail(customerEmail, orderNumber, refundAmount, frontendUrl = process.env.FRONTEND_URL || "https://softnexdigital-frontend.vercel.app") {
  if (!customerEmail) return true;
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>💰 Refund Processed</h2>
        <p>Your refund for order <strong>${orderNumber}</strong> has been processed.</p>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
          <h1 style="color: #28a745; margin: 0;">${refundAmount.toFixed(2)} BDT</h1>
          <p style="color: #666; font-size: 14px; margin-top: 5px;">Refund Amount</p>
        </div>
        <p>The amount will be credited to your original payment method within 3-5 business days.</p>
        <a href="${frontendUrl}/track-order/${orderNumber}" style="background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px;">Track Order</a>
        <hr>
        <p>Thank you for shopping with us.</p>
      </div>
    `;
    if (!transporter) {
      console.log(`📧 [DEV] Refund email to ${customerEmail}: ${orderNumber} -> ${refundAmount} BDT`);
      return true;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: customerEmail,
      subject: `Refund Processed for Order ${orderNumber}`,
      html,
    });
    console.log(`✓ Refund email sent to ${customerEmail}`);
    return true;
  } catch (error) {
    console.error("Error sending refund email:", error.message);
    return false;
  }
}

/**
 * Send password reset email with link
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @param {string} frontendUrl
 */
async function sendPasswordResetEmail(email, resetToken, frontendUrl = process.env.FRONTEND_URL || "https://softnexdigital-frontend.vercel.app") {
  try {
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2D7A3A, #1B5E27); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Password Reset</h1>
        </div>
        <div style="padding: 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
          <p>Hello,</p>
          <p>We received a request to reset the password for your account associated with <strong>${email}</strong>.</p>
          <p>Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #2D7A3A; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 13px;">This link will expire in 1 hour.</p>
          <p style="color: #666; font-size: 13px;">If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="color: #94a3b8; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      </div>
    `;

    if (!transporter) {
      console.log(`🔑 [DEV] Password reset email to ${email}: ${resetLink}`);
      return true;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Password Reset Request",
      html,
    });
    console.log(`✓ Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error.message);
    return false;
  }
}

module.exports = {
  sendOtpEmail,
  sendNewOrderEmail,
  sendOrderStatusEmail,
  sendRefundEmail,
  sendInvoiceToCustomer,
  sendPasswordResetEmail,
  generateInvoiceHtml,
  generateOrderNumber,
};
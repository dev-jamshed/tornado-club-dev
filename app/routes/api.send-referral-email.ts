// app/routes/api.send-referral-email.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

// ✅ SMTP Setup
import nodemailer from 'nodemailer';



const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'farhanalisamo417@gmail.com',
    pass: process.env.SMTP_PASSWORD || 'cxcn ydix jghh hlfc',
  },
});

// Generate WhatsApp share link
function getWhatsAppShareLink(referralCode: string, shopDomain: string) {
  const shopUrl = `https://${shopDomain}?ref=${referralCode}`;
  const message = `Check out this store! Use my referral code "${referralCode}" to get a FREE GIFT on your order.\n\nShop: ${shopUrl}`;
  
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

async function sendReferralEmailSMTP(to: string, name: string, referralCode: string) {
  const shopName = process.env.SHOP_NAME || "Tornado Club";
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || "tornado-club-dev.myshopify.com";
  const fromEmail = process.env.SMTP_USER || 'farhanalisamo417@gmail.com';

  const whatsappLink = getWhatsAppShareLink(referralCode, shopDomain);
  const shopLink = `https://${shopDomain}?ref=${referralCode}`;

  const emailHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">🎁 Your Referral Code</h1>
  </div>
  
  <div style="padding: 30px;">
    <p>Hi <strong>${name}</strong>,</p>
    
    <p>Here's your referral code:</p>
    
    <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
      <h2 style="color: #667eea; margin: 0;">${referralCode}</h2>
    </div>
    
    <p><strong>Store Link:</strong></p>
    <div style="background: #e8f4fd; padding: 10px; border-radius: 5px; margin: 10px 0;">
      <a href="${shopLink}" style="color: #667eea; word-break: break-all;">
        ${shopLink}
      </a>
    </div>
    
    <p><strong>How it works:</strong></p>
    <ul style="color: #555;">
      <li>Share this code with friends</li>
      <li>Friends get gift on their order</li>
      <li>You get gift when you reach milestones</li>
    </ul>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${whatsappLink}" 
         target="_blank"
         style="display: inline-block; background: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        📱 Share on WhatsApp
      </a>
      <p style="color: #666; font-size: 12px; margin-top: 8px;">
        Click to open WhatsApp and share automatically
      </p>
    </div>
    
    <p style="color: #777; font-size: 14px;">
      Thanks,<br>
      ${shopName} Team
    </p>
  </div>
</div>`;

  const mailOptions = {
    from: `"${shopName}" <${fromEmail}>`,
    to: to,
    subject: `Your Referral Code: ${referralCode} - Share & Earn!`,
    html: emailHtml,
    text: `🎁 Your Referral Code\n\nHi ${name},\n\nYour referral code: ${referralCode}\n\nStore link: ${shopLink}\n\nHow it works:\n• Share this code with friends\n• Friends get gift on their order\n• You get gift when you reach milestones\n\nShare on WhatsApp: ${whatsappLink}\n\nThanks,\n${shopName} Team`
  };

  try {
    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ SMTP Email sent to ${to}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`🔥 SMTP Email error for ${to}:`, error);
    throw error;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    
    if (!body.customerEmail || !body.referralCode) {
      return json(
        { success: false, error: "Missing customerEmail or referralCode" },
        { status: 400 }
      );
    }

    const customerName = body.customerName || "Customer";
    const customerEmail = body.customerEmail;
    const referralCode = body.referralCode;

    console.log(`📧 Sending referral email via SMTP to: ${customerEmail}`);

    const result = await sendReferralEmailSMTP(customerEmail, customerName, referralCode);
    
    return json({
      success: true,
      message: "Referral email sent successfully via SMTP",
      messageId: result.messageId,
      shopLink: `https://${process.env.SHOPIFY_SHOP_DOMAIN || 'tornado-club-dev.myshopify.com'}?ref=${referralCode}`,
      whatsappLink: getWhatsAppShareLink(referralCode, process.env.SHOPIFY_SHOP_DOMAIN || 'tornado-club-dev.myshopify.com')
    });

  } catch (error) {
    console.error("Error:", error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to send email via SMTP" 
      },
      { status: 500 }
    );
  }
}
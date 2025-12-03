// app/routes/api.send-referral-email.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

// ✅ SMTP Setup
import nodemailer from 'nodemailer';

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'farhanalisamo417@gmail.com',
    pass: process.env.SMTP_PASSWORD || 'cxcn ydix jghh hlfc',
  },
});

// ✅ Helper function to get all environment variables
function getEnvVariables() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error("Shopify credentials not configured");
  }

  return {
    shopDomain,
    accessToken,
  };
}

// ✅ Get customer referral code from Shopify metafields
async function getCustomerReferralCodeFromMetafields(customerEmail: string) {
  try {
    const { shopDomain, accessToken } = getEnvVariables();
    
    console.log(`🔍 Looking up customer by email: ${customerEmail}`);
    
    // Step 1: Find customer by email
    const searchResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(customerEmail)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("❌ Customer search failed:", errorText);
      return null;
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.customers || searchData.customers.length === 0) {
      console.log(`❌ No customer found with email: ${customerEmail}`);
      return null;
    }

    const customer = searchData.customers[0];
    console.log(`✅ Customer found: ${customer.id} - ${customer.email}`);
    
    // Step 2: Get customer metafields
    const metafieldsResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}/metafields.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!metafieldsResponse.ok) {
      const errorText = await metafieldsResponse.text();
      console.error("❌ Metafields fetch failed:", errorText);
      return null;
    }

    const metafieldsData = await metafieldsResponse.json();
    const metafields = metafieldsData.metafields || [];
    
    // Step 3: Look for referral code in metafields
    console.log(`📦 Checking ${metafields.length} metafields for referral code`);
    
    let referralCode = null;
    
    // Check different possible locations
    for (const field of metafields) {
      console.log(`  - ${field.namespace}.${field.key}: "${field.value}"`);
      
      if ((field.key === "referral_code" || field.key === "referralcode") && field.value) {
        referralCode = field.value;
        console.log(`✅ Found referral code in metafield: ${referralCode}`);
        break;
      }
    }
    
    return referralCode;
    
  } catch (error) {
    console.error("🔥 Get customer referral code error:", error);
    return null;
  }
}

// ✅ Generate WhatsApp share link
function getWhatsAppShareLink(referralCode: string, shopDomain: string) {
  const shopUrl = `https://${shopDomain}?ref=${referralCode}`;
  const message = `Check out this store! Use my referral code "${referralCode}" to get a FREE GIFT on your order.\n\nShop: ${shopUrl}`;
  
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

// ✅ Send email function
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
    console.log("📦 Request Body:", body);
    
    // ✅ Check for required fields
    if (!body.customerEmail) {
      return json(
        { success: false, error: "Missing customerEmail" },
        { status: 400 }
      );
    }

    const customerEmail = body.customerEmail;
    const customerName = body.customerName || "Customer";
    const referralCodeParam = body.referralCode;

    console.log(`🔍 Parameters received:`);
    console.log(`  - Email: ${customerEmail}`);
    console.log(`  - Name: ${customerName}`);
    console.log(`  - Referral Code Param: ${referralCodeParam}`);
    
    let referralCode = referralCodeParam;
    
    // ✅ CONDITION: Agar referralCode null/undefined hai
    if (!referralCode || referralCode === 'null' || referralCode === 'undefined') {
      console.log(`🔄 Referral code not provided, fetching from customer metafields...`);
      
      // Customer ke metafields se referral code nikalo
      const customerReferralCode = await getCustomerReferralCodeFromMetafields(customerEmail);
      
      if (customerReferralCode) {
        referralCode = customerReferralCode;
        console.log(`✅ Using referral code from metafields: ${referralCode}`);
      } else {
        // Agar metafields mein bhi nahi mila
        console.log(`❌ No referral code found in metafields for ${customerEmail}`);
        return json(
          { 
            success: false, 
            error: `No referral code found for customer ${customerEmail}. Please provide a referral code or ensure customer has one in Shopify metafields.` 
          },
          { status: 400 }
        );
      }
    }
    
    // ✅ Ab referralCode hai, email bhejo
    console.log(`📧 Sending referral email via SMTP to: ${customerEmail} with code: ${referralCode}`);

    const result = await sendReferralEmailSMTP(customerEmail, customerName, referralCode);
    
    return json({
      success: true,
      message: "Referral email sent successfully via SMTP",
      messageId: result.messageId,
      referralCode: referralCode,
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
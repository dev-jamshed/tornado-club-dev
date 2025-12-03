import { type ActionFunctionArgs, json } from "@remix-run/node";
import nodemailer from "nodemailer";

// ✅ ONLY order ID based deduplication - REMOVE referral code deduplication
const processedOrderIds = new Set();

// ✅ SMTP Transporter Setup (Only for milestone emails)
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// ✅ Helper function to get all environment variables
function getEnvVariables() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const adminEmail = process.env.ADMIN_EMAIL;
  const referralApiBaseUrl =
    "https://downloading-amazing-slightly-records.trycloudflare.com";
  const smtpUser = process.env.SMTP_USER;
  const storeUrl =
    process.env.STORE_URL || "https://tornado-club.myshopify.com";

  if (!shopDomain || !accessToken) {
    throw new Error("Shopify credentials not configured");
  }

  if (!smtpUser) {
    throw new Error("SMTP_USER not found in environment variables");
  }

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL not found in environment variables");
  }

  if (!referralApiBaseUrl) {
    throw new Error("REFERRAL_API_BASE_URL not found in environment variables");
  }

  return {
    shopDomain,
    accessToken,
    adminEmail,
    referralApiBaseUrl,
    smtpUser,
    storeUrl,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const payload = await request.json();

    console.log("🛒 Order created webhook received");

    // ✅ Shopify order created webhook data
    const { id, name, note_attributes, financial_status, customer } = payload;

    // ✅ STEP 0: ORDER ID BASED DEDUPLICATION ONLY
    if (processedOrderIds.has(id)) {
      console.log(`⏭️ Order ${id} already processed, skipping...`);
      return json(
        {
          success: true,
          message: "Order already processed",
          skipped: true,
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      );
    }

    // Mark order as processed
    processedOrderIds.add(id);
    console.log(`📝 Marked order ${id} as processed`);

    // ✅ Check if order is paid
    if (financial_status && financial_status !== "paid") {
      console.log(
        `⏭️ Order ${id} is not paid (${financial_status}), skipping...`,
      );
      return json(
        {
          success: true,
          message: "Order not paid, skipping processing",
          skipped: true,
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      );
    }

    // ✅ NEW: CUSTOMER KA REFERRAL CODE METAFIELD CHECK KAREIN AUR DATABASE MEIN VERIFY KAREIN
    let customerEmailSent = false;
    let databaseEntryCreated = false;
    let referralCodeFromMetafield = null;
    let generatedReferralCode = null;

    if (customer && customer.id) {
      try {
        console.log(
          `👤 Checking customer metafields for referral code, Customer ID: ${customer.id}`,
        );

        const customerDetails = await getCustomerWithMetafields(customer.id);

        console.log("🔍 Customer Details:", {
          id: customerDetails?.id,
          email: customerDetails?.email,
          hasMetafields: !!customerDetails?.metafields,
          metafieldsCount: customerDetails?.metafields?.length || 0,
        });

        let customerReferralCode = null;
        let shouldGenerateNewCode = false;

        if (
          customerDetails &&
          customerDetails.metafields &&
          customerDetails.metafields.length > 0
        ) {
          console.log(
            "📋 All Metafields found:",
            customerDetails.metafields.map((field: any) => ({
              namespace: field.namespace,
              key: field.key,
              value: field.value,
            })),
          );

          let referralMetafield = null;

          referralMetafield = customerDetails.metafields.find(
            (field: any) =>
              field.key === "referral_code" && field.namespace === "custom",
          );

          if (!referralMetafield) {
            referralMetafield = customerDetails.metafields.find(
              (field: any) => field.key === "referral_code",
            );
          }

          if (!referralMetafield) {
            referralMetafield = customerDetails.metafields.find(
              (field: any) =>
                field.key === "referralcode" || field.key === "referral",
            );
          }

          if (referralMetafield) {
            console.log("✅ Referral Metafield found:", {
              namespace: referralMetafield.namespace,
              key: referralMetafield.key,
              value: referralMetafield.value,
            });

            customerReferralCode = referralMetafield.value;
            referralCodeFromMetafield = customerReferralCode;
          } else {
            console.log("ℹ️ No referral code found in customer metafields");
            shouldGenerateNewCode = true;
          }
        } else {
          console.log("ℹ️ No metafields found for customer");
          shouldGenerateNewCode = true;
        }

        const customerName =
          `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
          "Customer";

        if (shouldGenerateNewCode) {
          console.log("🔄 No referral code found, generating new one...");

          const randomSuffix = Math.floor(10000 + Math.random() * 90000);
          customerReferralCode = `TC-${customer.id}-${randomSuffix}`;
          generatedReferralCode = customerReferralCode;

          console.log(
            `🎯 Generated new referral code: ${customerReferralCode}`,
          );

          await saveReferralCodeToMetafield(customer.id, customerReferralCode);

          console.log(
            `🔍 Checking if ${customerReferralCode} exists in database...`,
          );
          const checkResult =
            await checkReferralCodeInDatabase(customerReferralCode);

          if (checkResult && checkResult.exists) {
            console.log(
              `✅ Referral code ${customerReferralCode} exists in database`,
            );
          } else {
            console.log(
              `⚠️ Referral code ${customerReferralCode} NOT found in database, creating entry...`,
            );

            const newEntryResult = await createReferralCodeEntry(
              customer.id,
              customerName,
              customer.email,
              customerReferralCode,
            );

            if (newEntryResult.success) {
              console.log(
                `✅ New referral code entry created: ${customerReferralCode}`,
              );
              databaseEntryCreated = true;
            } else {
              console.log(
                `❌ Failed to create database entry for ${customerReferralCode}`,
              );
            }
          }

          console.log(`📤 Sending referral email to customer with new code...`);
          const emailSent = await sendCustomerReferralEmailSMTP(
            customer.email,
            customerName,
            customerReferralCode,
          );

          customerEmailSent = emailSent;
        } else if (customerReferralCode) {
          console.log(
            `🔍 Checking if ${customerReferralCode} exists in database...`,
          );
          const checkResult =
            await checkReferralCodeInDatabase(customerReferralCode);

          if (checkResult && checkResult.exists) {
            console.log(
              `✅ Referral code ${customerReferralCode} exists in database`,
            );

            console.log(`📤 Sending referral email to customer...`);
            const emailSent = await sendCustomerReferralEmailSMTP(
              customer.email,
              customerName,
              customerReferralCode,
            );

            customerEmailSent = emailSent;
            databaseEntryCreated = false;
          } else {
            console.log(
              `⚠️ Referral code ${customerReferralCode} NOT found in database`,
            );

            console.log(
              `📝 Creating new database entry for referral code: ${customerReferralCode}`,
            );

            const newEntryResult = await createReferralCodeEntry(
              customer.id,
              customerName,
              customer.email,
              customerReferralCode,
            );

            if (newEntryResult.success) {
              console.log(
                `✅ New referral code entry created: ${customerReferralCode}`,
              );
              databaseEntryCreated = true;

              console.log(
                `📤 Sending referral email to customer after creating entry...`,
              );
              const emailSent = await sendCustomerReferralEmailSMTP(
                customer.email,
                customerName,
                customerReferralCode,
              );

              customerEmailSent = emailSent;
            } else {
              console.log(
                `❌ Failed to create database entry for ${customerReferralCode}`,
              );
            }
          }
        }
      } catch (customerError) {
        console.error(
          "🔥 Error in customer referral code process:",
          customerError,
        );
      }
    }

    // ✅ Referral code aur discount code extract karo
    let referralCode = null;
    let discountCode = null;
    let claimRewardToken = null;

    if (note_attributes && Array.isArray(note_attributes)) {
      // Referral code extract karo
      const referralAttr = note_attributes.find(
        (attr) => attr.name === "referral_code_used",
      );
      if (referralAttr) {
        referralCode = referralAttr.value;
      }

      // Discount code extract karo
      const discountAttr = note_attributes.find(
        (attr) => attr.name === "applied_discount_code",
      );
      if (discountAttr) {
        discountCode = discountAttr.value;
      }

      // ✅ CLAIM REWARD TOKEN EXTRACT KARO
      const claimTokenAttr = note_attributes.find(
        (attr) =>
          attr.name === "claim_reward_token" ||
          attr.name === "claim_reward_token_used",
      );
      if (claimTokenAttr) {
        claimRewardToken = claimTokenAttr.value;
        console.log(
          "🎯 Found claim reward token in order:",
          claimRewardToken?.substring(0, 20) + "...",
        );
      }
    }

    // ✅ CLAIM TOKEN PROCESSING - AGAR CLAIM TOKEN USE KIA GAYA HAI
    let claimRewardProcessed = false;
    let claimRewardDetails = null;

    if (claimRewardToken) {
      console.log("🔍 Processing claim reward token...");
      referralCode = null; 
      discountCode = null; 
      try {
        // ✅ STEP 1: VERIFY CLAIM TOKEN
        const verifyResponse = await fetch(
          `${getEnvVariables().referralApiBaseUrl}/api/verify-claim-reward`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: claimRewardToken }),
          },
        );

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          console.log("📦 Claim token verification result:", verifyData);

          if (verifyData.success && verifyData.isValid) {
            const claimReferralCode = verifyData.data?.referralCode;

            if (claimReferralCode) {
              console.log(
                `✅ Claim token verified for referral: ${claimReferralCode}`,
              );

              // ✅ STEP 2: UPDATE CLAIM REWARD STATUS IN DATABASE
              const updateResponse = await fetch(
                `${getEnvVariables().referralApiBaseUrl}/api/update-reward-redemption`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    referralCode: claimReferralCode,
                    status: "redeemed", // Change from pending to redeemed
                    orderId: id,
                    orderName: name,
                    redeemedAt: new Date().toISOString(),
                  }),
                },
              );

              if (updateResponse.ok) {
                const updateData = await updateResponse.json();
                console.log("✅ Claim reward status updated:", updateData);

                claimRewardProcessed = true;
                claimRewardDetails = {
                  referralCode: claimReferralCode,
                  status: "redeemed",
                  orderId: id,
                  orderName: name,
                };

                // ✅ STEP 3: SEND CLAIM REWARD CONFIRMATION EMAIL
                if (customer?.email) {
                  await sendClaimRewardConfirmationEmail(
                    customer.email,
                    `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
                    claimReferralCode,
                    name,
                  );
                }

                // ✅ STEP 4: ADMIN KO CLAIM REWARD NOTIFICATION
                await sendClaimRewardAdminNotification(
                  claimReferralCode,
                  customer?.email,
                  id,
                  name,
                );
              } else {
                console.error("❌ Failed to update claim reward status");
              }
            }
          } else {
            console.log("❌ Claim token verification failed");
          }
        } else {
          console.error("❌ Claim token verification API error");
        }
      } catch (error) {
        console.error("🔥 Claim token processing error:", error);
      }
    }

    // ✅ Agar referral code aur discount code mile to processing karo
    if (referralCode && discountCode) {
      console.log(
        `🎯 Found referral code: ${referralCode} with discount code: ${discountCode}`,
      );

      // ✅ STEP 1: Specific discount code delete karo
      const discountDeleted = await deleteSpecificDiscountCode(
        discountCode,
        id,
      );

      // ✅ STEP 2: Referral count update karo aur customer data get karo
      const referralResult = await updateReferralCount(referralCode);


      

      // ✅ STEP 3: Agar pehli successful referral hai to "Inviter" tag add karo
      if (referralResult.success && referralResult.newReferralCount === 1) {
        await addInviterTag(referralResult.customerId);
      }

      // ✅ STEP 4: EMAILS BHEJO - Admin aur Referrer ko (WITH RATE LIMIT PROTECTION)
      if (referralResult.success && referralResult.customerEmail) {
        await sendMilestoneEmails(
          referralResult.customerEmail,
          referralResult.newReferralCount,
          customer?.email, // New customer jo order place kiya
        );
      } 
      
      const referrerName = await getCustomerNameByEmail(referralResult.customerEmail);


// ✅ REFERRER KO NOTIFICATION EMAIL BHEJO
if (referralResult.success && referralResult.customerEmail) {
  console.log(`📧 Sending notification to referrer: ${referralResult.customerEmail}`);
  
  // SIRF EMAIL BHEJO, NAAM NAHI
  const referrerNotification = await sendReferrerNotificationEmail(
    referralResult.customerEmail, // Referrer ki email
    customer?.email || "New Customer", // New customer ki email
    referralCode, // Referral code
  );
  
  console.log(`✅ Referrer notification result:`, referrerNotification);
}

    
      console.log(`✅ Order processing completed for referral ${referralCode}`);

      return json(
        {
          success: true,
          message: `Discount code deleted and referral count updated for ${referralCode}`,
          orderId: id,
          orderName: name,
          discountDeleted: discountDeleted,
          referralUpdated: referralResult,
          inviterTagAdded: referralResult.newReferralCount === 1,
          emailsSent: true,
          customerEmailSent: customerEmailSent,
          databaseEntryCreated: databaseEntryCreated,
          referralCodeFromMetafield: referralCodeFromMetafield,
          generatedReferralCode: generatedReferralCode,
          claimRewardProcessed: claimRewardProcessed,
          claimRewardDetails: claimRewardDetails,
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      );
    } else {
      console.log("ℹ️ No referral/discount data found in this order");

      return json(
        {
          success: true,
          message: "No referral/discount data found in order",
          customerEmailSent: customerEmailSent,
          databaseEntryCreated: databaseEntryCreated,
          referralCodeFromMetafield: referralCodeFromMetafield,
          generatedReferralCode: generatedReferralCode,
          claimRewardProcessed: claimRewardProcessed,
          claimRewardDetails: claimRewardDetails,
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      );
    }
  } catch (error) {
    console.error("🔥 Order webhook error:", error);
    return json(
      {
        success: false,
        error: "Webhook processing failed",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    );
  }
}

// ✅ CLAIM REWARD CONFIRMATION EMAIL
async function sendClaimRewardConfirmationEmail(
  customerEmail: string,
  customerName: string,
  referralCode: string,
  orderName: string,
) {
  try {
    const { smtpUser, storeUrl } = getEnvVariables();

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #28a745;">🎉 Claim Reward Successfully Redeemed!</h1>
      </div>
      
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #155724; margin-top: 0;">✅ Your claim reward has been processed</h3>
        <p style="color: #155724; line-height: 1.6;">
          Thank you for redeeming your claim reward. Here are the details:
        </p>
        <ul style="color: #155724; line-height: 1.6;">
          <li><strong>Referral Code:</strong> ${referralCode}</li>
          <li><strong>Order Number:</strong> ${orderName}</li>
          <li><strong>Status:</strong> Successfully Redeemed</li>
          <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
        </ul>
      </div>

      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0;">📦 Your Order Status</h3>
        <p style="color: #555; line-height: 1.6;">
          Your order with the free reward product is now being processed. 
          You can track your order status by visiting your account.
        </p>
        <a href="${storeUrl}/account" 
           style="display: inline-block; background-color: #ffc107; color: #856404; 
                  padding: 10px 20px; text-decoration: none; border-radius: 5px; 
                  font-weight: bold; margin-top: 10px;">
          View My Orders
        </a>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #777;">Thank you for being part of Tornado Club! 🚀</p>
        <p style="color: #999; font-size: 12px;">If you have any questions, contact our support team.</p>
      </div>
    </div>`;

    const mailOptions = {
      from: `"Tornado Club Rewards" <${smtpUser}>`,
      to: customerEmail,
      subject: `✅ Claim Reward Redeemed - Order ${orderName}`,
      html: emailHtml,
      text: `✅ Claim Reward Successfully Redeemed!\n\nYour claim reward has been processed:\n\nReferral Code: ${referralCode}\nOrder Number: ${orderName}\nStatus: Successfully Redeemed\nDate: ${new Date().toLocaleDateString()}\n\nYour order with the free reward product is now being processed.\n\nView your orders: ${storeUrl}/account\n\nThank you for being part of Tornado Club! 🚀`,
    };

    console.log(`📤 Sending claim reward confirmation to: ${customerEmail}`);

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ Claim reward confirmation email sent:`, info.messageId);
    return { sent: true, emailId: info.messageId };
  } catch (error) {
    console.error(`🔥 Claim reward confirmation email error:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ CLAIM REWARD ADMIN NOTIFICATION
async function sendClaimRewardAdminNotification(
  referralCode: string,
  customerEmail: string,
  orderId: string,
  orderName: string,
) {
  try {
    const { smtpUser, adminEmail } = getEnvVariables();

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="border-bottom: 2px solid #667eea; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #2c3e50; margin: 0;">🎯 Claim Reward Redeemed</h2>
        <p style="color: #7f8c8d; margin: 5px 0 0 0;">Automatic System Notification</p>
      </div>

      <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745;">
        <strong>✅ A claim reward has been successfully redeemed!</strong>
      </div>

      <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #2c3e50; margin-top: 0;">📋 Claim Reward Details</h3>
        <p><strong>Referral Code:</strong> ${referralCode}</p>
        <p><strong>Customer Email:</strong> ${customerEmail || "Not provided"}</p>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Order Name:</strong> ${orderName}</p>
        <p><strong>Status:</strong> Redeemed ✅</p>
        <p><strong>Redeemed On:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
        <p>This is an automated notification from Tornado Club Referral System</p>
        <p>Generated on: ${new Date().toISOString()}</p>
      </div>
    </div>`;

    const mailOptions = {
      from: `"Tornado Club Rewards Alerts" <${smtpUser}>`,
      to: adminEmail,
      subject: `✅ Claim Reward Redeemed - ${referralCode}`,
      html: emailHtml,
      text: `✅ Claim Reward Redeemed\n\nReferral Code: ${referralCode}\nCustomer Email: ${customerEmail || "Not provided"}\nOrder ID: ${orderId}\nOrder Name: ${orderName}\nStatus: Redeemed\nRedeemed On: ${new Date().toLocaleString()}\n\nThis is an automated notification from Tornado Club Referral System`,
    };

    console.log(`📤 Sending claim reward notification to admin: ${adminEmail}`);

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ Claim reward admin notification sent:`, info.messageId);
    return { sent: true, emailId: info.messageId };
  } catch (error) {
    console.error(`🔥 Claim reward admin notification error:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ NEW: UPDATE CLAIM REWARD STATUS API ENDPOINT BANAO (create new file: /api/update-reward-redemption.ts)
/*
Example API endpoint structure:

import { type ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { referralCode, status, orderId, orderName, redeemedAt } = body;

    // Find the reward redemption entry
    const rewardRedemption = await prisma.rewardRedemption.findUnique({
      where: { referralCode }
    });

    if (!rewardRedemption) {
      return new Response(JSON.stringify({
        success: false,
        error: "Reward redemption not found"
      }), { status: 404 });
    }

    // Update the status
    const updated = await prisma.rewardRedemption.update({
      where: { referralCode },
      data: {
        rewardStatus: status || "redeemed",
        redeemedAt: redeemedAt || new Date(),
        orderId: orderId,
        orderName: orderName
      }
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Reward redemption status updated",
      data: updated
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error updating reward redemption:", error);
    return new Response(JSON.stringify({
      success: false,
      error: "Failed to update reward redemption"
    }), { status: 500 });
  }
}
*/

// ✅ SAVE REFERRAL CODE TO CUSTOMER METAFIELD
async function saveReferralCodeToMetafield(
  customerId: string,
  referralCode: string,
) {
  try {
    const { shopDomain, accessToken } = getEnvVariables();

    console.log(
      `💾 Saving referral code to customer metafield: ${referralCode}`,
    );

    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}/metafields.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          metafield: {
            namespace: "custom",
            key: "referral_code",
            value: referralCode,
            type: "single_line_text_field",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Save to metafield failed:", errorText);
      return false;
    }

    const result = await response.json();
    console.log("✅ Referral code saved to customer metafield:", result);
    return true;
  } catch (error) {
    console.error("🔥 Save referral code to metafield error:", error);
    return false;
  }
}

// ✅ GET CUSTOMER WITH METAFIELDS
async function getCustomerWithMetafields(customerId: string) {
  try {
    const { shopDomain, accessToken } = getEnvVariables();

    console.log(`🔍 Fetching customer data with ID: ${customerId}`);

    const customerResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      console.error("❌ Customer fetch failed:", errorText);
      return null;
    }

    const customerData = await customerResponse.json();
    const customer = customerData.customer;

    console.log(`✅ Basic customer data fetched for: ${customer.email}`);

    const metafieldsResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}/metafields.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (metafieldsResponse.ok) {
      const metafieldsData = await metafieldsResponse.json();
      customer.metafields = metafieldsData.metafields || [];
      console.log(`✅ Fetched ${customer.metafields.length} metafields`);
    } else {
      const errorText = await metafieldsResponse.text();
      console.error("❌ Metafields fetch failed:", errorText);
      customer.metafields = [];
    }

    return customer;
  } catch (error) {
    console.error("🔥 Get customer with metafields error:", error);
    return null;
  }
}

// ✅ CHECK REFERRAL CODE IN DATABASE
async function checkReferralCodeInDatabase(referralCode: string) {
  try {
    const { referralApiBaseUrl } = getEnvVariables();

    console.log(
      `🔍 Checking if referral code exists in database: ${referralCode}`,
    );

    const response = await fetch(
      `${referralApiBaseUrl}/api/create-referral?code=${referralCode}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Referral code check failed:", errorText);
      return null;
    }

    const result = await response.json();
    console.log("✅ Referral code check result:", result);

    return {
      exists:
        result.found ||
        result.exists ||
        (result.data && result.data.referralCode === referralCode),
      data: result.data,
    };
  } catch (error) {
    console.error("🔥 Check referral code error:", error);
    return null;
  }
}

// ✅ CREATE REFERRAL CODE ENTRY IN DATABASE
async function createReferralCodeEntry(
  customerId: string,
  customerName: string,
  customerEmail: string,
  referralCode: string,
) {
  try {
    const { referralApiBaseUrl } = getEnvVariables();

    console.log(`📤 Creating new referral code entry: ${referralCode}`);

    const response = await fetch(`${referralApiBaseUrl}/api/create-referral`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId: customerId.toString(),
        customerName: customerName,
        customerEmail: customerEmail,
        referralCode: referralCode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Create referral code entry failed:", errorText);
      return {
        success: false,
        error: errorText,
      };
    }

    const result = await response.json();
    console.log("✅ Create referral code entry result:", result);

    return {
      success: result.success || false,
      data: result.data || result,
      existing: result.existing || false,
    };
  } catch (error) {
    console.error("🔥 Create referral code entry error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ CUSTOMER REFERRAL EMAIL SEND FUNCTION
async function sendCustomerReferralEmailSMTP(
  customerEmail: string,
  customerName: string,
  referralCode: string,
) {
  try {
    const { referralApiBaseUrl } = getEnvVariables();
    const response = await fetch(
      `${referralApiBaseUrl}/api/send-referral-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail, customerName, referralCode }),
      },
    );

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
}

// ✅ MILESTONE EMAILS SEND KARNE KA FUNCTION
// ✅ MILESTONE EMAILS SEND KARNE KA FUNCTION (REFERRAL SETTINGS CHECK KAREIN)
async function sendMilestoneEmails(
  referrerEmail: string,
  referralCount: number,
  newCustomerEmail?: string,
) {
  try {
    console.log(`📧 Checking milestone emails for ${referralCount} referrals`);

    // ✅ PEHLE REFERRAL SETTINGS CHECK KAREIN
    const { referralApiBaseUrl } = getEnvVariables();
    
    let shouldSendEmail = false;
    let claimLink = null;

    try {
      // Referral settings fetch karein
      const settingsResponse = await fetch(
        `${referralApiBaseUrl}/api/referral-setting`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        
        // ✅ Check karein ke kya koi rewards configured hain
        if (settingsData.data?.referralRewards?.rewards) {
          const rewards = settingsData.data.referralRewards.rewards;
          
          // ✅ Dekhein ke current referral count kisi reward ke equal hai ya nahi
          const matchingReward = rewards.find((reward: any) => {
            const requiredCount = parseInt(reward.referralCount) || 0;
            return parseInt(referralCount.toString()) === requiredCount;
          });

          if (matchingReward) {
            console.log(`🎯 Milestone match found: ${referralCount} referrals = Reward`);
            shouldSendEmail = true;
            
            // Claim link generate karein
            const referralCode = await findReferralCodeByEmail(referrerEmail);
            if (referralCode) {
              const customerName = await getCustomerNameByEmail(referrerEmail);
              const rewardRedemption = await createRewardRedemptionEntry(
                referralCode,
                referrerEmail,
                customerName || "Customer",
                referralCount,
              );
              claimLink = rewardRedemption?.claimLink;
            }
          } else {
            console.log(`ℹ️ No milestone configured for ${referralCount} referrals, skipping email`);
            shouldSendEmail = false;
          }
        } else {
          console.log("ℹ️ No rewards configured in settings, skipping milestone email");
          shouldSendEmail = false;
        }
      } else {
        console.log("⚠️ Could not fetch referral settings, skipping milestone email");
        shouldSendEmail = false;
      }
    } catch (settingsError) {
      console.error("🔥 Error checking referral settings:", settingsError);
      shouldSendEmail = false;
    }

    // ✅ Agar milestone match kare tabhi email bhejein
    if (!shouldSendEmail) {
      console.log(`⏭️ Skipping milestone email for ${referralCount} referrals (no match in settings)`);
      return [];
    }

    console.log(`✅ Sending milestone emails for ${referralCount} referrals (matched in settings)`);

    const referralCode = await findReferralCodeByEmail(referrerEmail);

    const emailsSent = [];

    // ✅ REFERRER KO CONGRATULATIONS EMAIL
    const referrerEmailResult = await sendReferrerCongratulationsSMTP(
      referrerEmail,
      referralCount,
      claimLink,
    );
    emailsSent.push({
      to: referrerEmail,
      type: "congratulations",
      success: referrerEmailResult,
      referralCode: referralCode,
      claimLink: claimLink,
    });

    // ✅ ADMIN KO NOTIFICATION EMAIL
    const adminEmailResult = await sendAdminNotificationSMTP(
      referrerEmail,
      referralCount,
      newCustomerEmail,
    );
    emailsSent.push({
      to: "admin",
      type: "notification",
      success: adminEmailResult,
    });

    console.log(`✅ All milestone emails sent:`, emailsSent);
    return emailsSent;

  } catch (error) {
    console.error("🔥 Milestone emails error:", error);
    return [];
  }
}
// ✅ REFERRER KO CONGRATULATIONS EMAIL
async function sendReferrerCongratulationsSMTP(
  email: string,
  referralCount: number,
  claimLink?: string | null,
) {
  try {
    const { smtpUser } = getEnvVariables();

    let claimLinkSection = "";
    let claimLinkText = "";

    if (claimLink) {
      claimLinkSection = `
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <h3 style="color: #155724; margin-top: 0;">🎁 Claim Your Reward!</h3>
        <p style="color: #155724; line-height: 1.6;">
          Click below to claim your reward for ${referralCount} referrals:
        </p>
        <a href="${claimLink}" 
           style="display: inline-block; background-color: #28a745; color: white; 
                  padding: 12px 30px; text-decoration: none; border-radius: 5px; 
                  font-weight: bold; margin-top: 10px;">
          🎯 Claim Now
        </a>
        <p style="color: #6c757d; font-size: 14px; margin-top: 10px;">
          Or copy this link: ${claimLink}
        </p>
      </div>`;

      claimLinkText = `\n\n🎁 CLAIM YOUR REWARD: ${claimLink}`;

      console.log(`🔗 Sending claim link in email: ${claimLink}`);
    }

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333;">🎉 Congratulations!</h1>
        <p style="color: #666; font-size: 18px;">You've reached a referral milestone!</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #28a745; margin-top: 0;">🏆 Milestone Achieved: ${referralCount} Referrals</h3>
        <p style="color: #555; line-height: 1.6;">
          Thank you for referring ${referralCount} friends to Tornado Club! Your support means everything to us.
        </p>
      </div>

      ${
        claimLink
          ? claimLinkSection
          : `
      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0;">🎁 Your Reward is Ready!</h3>
        <p style="color: #555; line-height: 1.6;">
          A special reward has been unlocked for you.
        </p>
      </div>`
      }

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #777;">Thank you for being an amazing ambassador! ❤️</p>
        <p style="color: #999; font-size: 12px;">Tornado Club Team</p>
      </div>
    </div>`;

    const mailOptions = {
      from: `"Tornado Club" <${smtpUser}>`,
      to: email,
      subject: `🎉 Congratulations! ${referralCount} Referrals Completed`,
      html: emailHtml,
      text: `🎉 Congratulations!\n\nYou've reached ${referralCount} referrals!\n\nThank you for referring ${referralCount} friends to Tornado Club!${claimLinkText}\n\nThank you for your support!\n\nTornado Club Team`,
    };

    console.log(`📤 Sending congratulations email to referrer: ${email}`);

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ Congratulations email sent to ${email}:`, info.messageId);
    return { sent: true, emailId: info.messageId };
  } catch (error) {
    console.error(`🔥 Referrer email error for ${email}:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ ADMIN KO NOTIFICATION EMAIL
async function sendAdminNotificationSMTP(
  referrerEmail: string,
  referralCount: number,
  newCustomerEmail?: string,
) {
  try {
    const { smtpUser, adminEmail } = getEnvVariables();

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="border-bottom: 2px solid #667eea; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0;">🚀 Referral Milestone Achieved</h2>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Automatic System Notification</p>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
            <strong>🎯 Customer reached referral milestone!</strong>
          </div>

          <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3 style="color: #2c3e50; margin-top: 0;">📊 Milestone Details</h3>
            <p><strong>Referrer:</strong> ${referrerEmail}</p>
            <p><strong>Milestone:</strong> ${referralCount} Referrals</p>
            ${newCustomerEmail ? `<p><strong>Customer:</strong> ${newCustomerEmail}</p>` : ""}
            <p><strong>Achieved On:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <p><strong>Next Steps:</strong> No action required.</p>

          <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
            <p>This is an automated notification from Tornado Club Referral System</p>
            <p>Generated on: ${new Date().toISOString()}</p>
          </div>
        </div>`;

    const mailOptions = {
      from: `"Tornado Club Alerts" <${smtpUser}>`,
      to: adminEmail,
      subject: `🔔 Referral Milestone: ${referralCount} Referrals`,
      html: emailHtml,
      text: `🔔 Referral Milestone Notification\n\nReferrer: ${referrerEmail}\nMilestone: ${referralCount} Referrals\nCustomer: ${newCustomerEmail || "N/A"}\nTime: ${new Date().toLocaleString()}\n\nAutomated actions completed successfully.\n\nNo action required.\n\nTornado Club Referral System`,
    };

    console.log(`📤 Sending admin notification email to: ${adminEmail}`);

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ Admin notification email sent:`, info.messageId);
    return { sent: true, emailId: info.messageId };
  } catch (error) {
    console.error(`🔥 Admin email error:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ "INVITER" TAG ADD KARNE KA FUNCTION
async function addInviterTag(customerId: string) {
  try {
    console.log(`🏷️ Adding "Inviter" tag to customer: ${customerId}`);

    const { shopDomain, accessToken } = getEnvVariables();

    const customerResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      console.error("🔥 Customer fetch failed:", errorText);
      throw new Error(`Customer fetch failed: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();
    const customer = customerData.customer;

    const currentTags = customer.tags
      ? customer.tags.split(",").map((tag: string) => tag.trim())
      : [];

    if (currentTags.includes("Inviter")) {
      console.log(`ℹ️ Customer already has "Inviter" tag`);
      return true;
    }

    const newTags = [...currentTags, "Inviter"].join(", ");

    const updateResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          customer: {
            id: customerId,
            tags: newTags,
          },
        }),
      },
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("🔥 Customer update failed:", errorText);
      throw new Error(`Customer update failed: ${updateResponse.status}`);
    }

    console.log(
      `✅ Successfully added "Inviter" tag to customer: ${customer.email}`,
    );
    return true;
  } catch (error) {
    console.error("🔥 Add inviter tag error:", error);
    throw error;
  }
}

// ✅ DISCOUNT CODE DELETE FUNCTION
async function deleteSpecificDiscountCode(
  discountCode: string,
  orderId: string,
) {
  try {
    console.log(`🗑️ Deleting specific discount code: ${discountCode}`);

    const { shopDomain, accessToken } = getEnvVariables();

    const priceRulesResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/price_rules.json?limit=250`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!priceRulesResponse.ok) {
      const errorText = await priceRulesResponse.text();
      console.error("🔥 Price rules fetch failed:", errorText);
      return false;
    }

    const priceRulesData = await priceRulesResponse.json();
    console.log(
      "🔍 Total price rules found:",
      priceRulesData.price_rules?.length,
    );

    if (priceRulesData.price_rules && priceRulesData.price_rules.length > 0) {
      for (const priceRule of priceRulesData.price_rules) {
        try {
          const discountCodesResponse = await fetch(
            `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.id}/discount_codes.json`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
              },
            },
          );

          if (discountCodesResponse.ok) {
            const discountCodesData = await discountCodesResponse.json();

            if (
              discountCodesData.discount_codes &&
              discountCodesData.discount_codes.length > 0
            ) {
              const targetDiscount = discountCodesData.discount_codes.find(
                (dc: { code: string }) => dc.code === discountCode,
              );

              if (targetDiscount) {
                console.log(
                  `🎯 Found exact discount code match: ${targetDiscount.code}`,
                );

                const deleteResponse = await fetch(
                  `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.id}.json`,
                  {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Shopify-Access-Token": accessToken,
                    },
                  },
                );

                if (deleteResponse.ok) {
                  console.log(
                    `✅ Deleted specific discount code: ${discountCode}`,
                  );

                  try {
                    await fetch(
                      `https://${shopDomain}/admin/api/2024-01/orders/${orderId}.json`,
                      {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          "X-Shopify-Access-Token": accessToken,
                        },
                        body: JSON.stringify({
                          order: {
                            id: orderId,
                            note: `✅ Referral processed. Discount code ${discountCode} deleted.`,
                          },
                        }),
                      },
                    );
                  } catch (noteError) {
                    console.error("🔥 Error updating order note:", noteError);
                  }

                  return true;
                }
              }
            }
          }
        } catch (priceRuleError) {
          console.error(
            `🔥 Error processing price rule ${priceRule.id}:`,
            priceRuleError,
          );
          continue;
        }
      }
    }

    console.log(`❌ Discount code ${discountCode} not found`);
    return false;
  } catch (error) {
    console.error("🔥 Delete specific discount code error:", error);
    return false;
  }
}

// ✅ REFERRAL COUNT UPDATE KARNE KA FUNCTION
async function updateReferralCount(referralCode: string) {
  try {
    console.log(`📈 Updating referral count for: ${referralCode}`);

    const { referralApiBaseUrl } = getEnvVariables();

    const response = await fetch(
      `${referralApiBaseUrl}/api/update-referral-count`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referralCode: referralCode,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Referral count update failed:", errorText);
      throw new Error(`Referral count update failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Referral count update result:", result);

    if (result.success && result.customerId) {
      await checkAndAssignRewards(result.customerId, result.newReferralCount);
    }

    return result;
  } catch (error) {
    console.error("🔥 Update referral count error:", error);
    throw error;
  }
}

// ✅ REWARD CHECK FUNCTION
async function checkAndAssignRewards(
  customerId: string,
  currentReferralCount: number,
) {
  try {
    console.log(
      `🎁 Checking rewards for customer ${customerId} with ${currentReferralCount} referrals`,
    );

    const { shopDomain, accessToken, referralApiBaseUrl } = getEnvVariables();

    let rewardLevels = [];
    try {
      const settingsResponse = await fetch(
        `${referralApiBaseUrl}/api/referral-setting`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();

        if (settingsData.data?.referralRewards?.rewards) {
          rewardLevels = settingsData.data.referralRewards.rewards;
        } else if (settingsData.data?.referralRewards) {
          rewardLevels = settingsData.data.referralRewards;
        } else if (settingsData.referralRewards?.rewards) {
          rewardLevels = settingsData.referralRewards.rewards;
        } else if (Array.isArray(settingsData.data)) {
          rewardLevels = settingsData.data;
        } else if (Array.isArray(settingsData.referralRewards)) {
          rewardLevels = settingsData.referralRewards;
        }

        console.log(`📊 Loaded ${rewardLevels.length} reward levels`);
      } else {
        console.log("❌ Failed to load reward levels from API");
        return;
      }
    } catch (settingsError) {
      console.log("❌ Error loading reward levels:", settingsError);
      return;
    }

    let customer = null;
    try {
      const customerResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
        },
      );

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        customer = customerData.customer;
        console.log(`👤 Customer data loaded: ${customer.email}`);
      } else {
        console.error("❌ Customer fetch failed for reward check");
        return;
      }
    } catch (customerError) {
      console.error("❌ Error loading customer data:", customerError);
      return;
    }

    const uniqueRewards = rewardLevels.filter(
      (reward: any, index: number, self: any[]) =>
        index ===
        self.findIndex(
          (r: any) =>
            (parseInt(r.referralCount) || 0) ===
            (parseInt(reward.referralCount) || 0),
        ),
    );

    const achievedRewards = uniqueRewards.filter((reward: any) => {
      const rewardCount = parseInt(reward.referralCount) || 0;
      const currentCount = parseInt(currentReferralCount.toString()) || 0;
      return rewardCount === currentCount;
    });

    if (achievedRewards.length > 0) {
      console.log(
        `🎉 Customer achieved ${achievedRewards.length} reward levels at ${currentReferralCount} referrals!`,
      );
      const rewardToProcess = achievedRewards[0];
      await sendRewardNotification(
        customer,
        rewardToProcess,
        currentReferralCount,
      );
    } else {
      console.log(
        `ℹ️ No reward levels achieved at ${currentReferralCount} referrals`,
      );
    }
  } catch (error) {
    console.error("🔥 Reward check error:", error);
  }
}

// ✅ REWARD NOTIFICATION FUNCTION
async function sendRewardNotification(
  customer: any,
  reward: any,
  referralCount: number,
) {
  try {
    console.log(
      `📧 Sending reward notification for ${referralCount} referrals`,
    );

    const { shopDomain, accessToken } = getEnvVariables();

    let productName = "Special Reward";
    try {
      const productId = reward.referrerProduct.split("/").pop();
      const productResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
        },
      );

      if (productResponse.ok) {
        const productData = await productResponse.json();
        productName = productData.product.title;
        console.log(`📦 Product name resolved: ${productName}`);
      }
    } catch (productError) {
      console.error("❌ Error fetching product name:", productError);
    }

    const notificationMessage = `🎉 MILESTONE ACHIEVED! 

You've successfully referred ${referralCount} friends to our store! 

As a thank you, you've earned:
🏆 ${productName}

Your reward will be automatically applied to your next order.

Keep sharing the love! 💝`;

    try {
      const customerResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
        },
      );

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        const currentCustomer = customerData.customer;

        const currentNote = currentCustomer.note || "";
        const cleanedNote = currentNote
          .split("\n")
          .filter(
            (line: string) =>
              !line.includes("REFERRAL MILESTONE") &&
              !line.includes("REFERRAL REWARD"),
          )
          .join("\n")
          .trim();

        const newNote =
          `🎯 REFERRAL MILESTONE - ${referralCount} REFERRALS\n${notificationMessage}\n\n${cleanedNote}`.trim();

        await fetch(
          `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}.json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              customer: {
                id: customer.id,
                note: newNote,
              },
            }),
          },
        );

        console.log(`✅ Reward note updated for ${customer.email}`);
      }
    } catch (noteError) {
      console.error("❌ Error updating customer note:", noteError);
    }

    console.log(`✅ All notifications processed for ${customer.email}`);
  } catch (error) {
    console.error("🔥 Reward notification error:", error);
  }
}

// ✅ Handle OPTIONS for CORS Preflight
export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}

// ✅ FIND REFERRAL CODE BY EMAIL
async function findReferralCodeByEmail(email: string) {
  try {
    const { shopDomain, accessToken } = getEnvVariables();

    console.log(`🔍 Looking up customer by email: ${email}`);

    const searchResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
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
      console.log(`❌ No customer found with email: ${email}`);
      return null;
    }

    const customer = searchData.customers[0];
    console.log(`✅ Customer found: ${customer.id} - ${customer.email}`);

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

    console.log(
      `📦 Checking ${metafields.length} metafields for referral code`,
    );

    let referralCode = null;

    for (const field of metafields) {
      console.log(`  - ${field.namespace}.${field.key}: "${field.value}"`);

      if (
        (field.key === "referral_code" || field.key === "referralcode") &&
        field.value
      ) {
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

// ✅ GET CUSTOMER NAME BY EMAIL
async function getCustomerNameByEmail(email: string) {
  try {
    const { shopDomain, accessToken } = getEnvVariables();

    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (result.customers && result.customers.length > 0) {
      const customer = result.customers[0];
      return `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
    }

    return null;
  } catch (error) {
    console.error("🔥 Get customer name error:", error);
    return null;
  }
}

// ✅ CREATE REWARD REDEMPTION ENTRY IN DATABASE
async function createRewardRedemptionEntry(
  referralCode: string,
  customerEmail: string,
  customerName: string,
  referralCount: number,
) {
  try {
    const { referralApiBaseUrl } = getEnvVariables();

    console.log(`🎁 Creating reward redemption entry for: ${referralCode}`);

    const response = await fetch(
      `${referralApiBaseUrl}/api/create-reward-redemption`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referralCode: referralCode,
          customerEmail: customerEmail,
          customerName: customerName,
          referralCount: referralCount,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Create reward redemption failed:", errorText);
      return null;
    }

    const result = await response.json();
    console.log("✅ Reward redemption entry created:", result);

    return result.data || result;
  } catch (error) {
    console.error("🔥 Create reward redemption error:", error);
    return null;
  }
}// ✅ REFERRER KO NOTIFICATION EMAIL (jisne refer kiya)
async function sendReferrerNotificationEmail(
  referrerEmail: string,
  newCustomerEmail: string,
  referralCode: string,

) {
  try {
    const { smtpUser, storeUrl } = getEnvVariables();

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #28a745;">🎉 Someone Shopped Using Your Referral!</h1>
      </div>
      
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #155724; margin-top: 0;">✅ Your referral has made a purchase!</h3>
        <p style="color: #155724; line-height: 1.6;">
          Great news! Someone has completed a purchase using your referral link.
        </p>
        
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border: 1px solid #c3e6cb;">
          <h4 style="color: #155724; margin-top: 0;">📊 Referral Details</h4>
          <p><strong>Your Referral Code:</strong> ${referralCode}</p>
          <p><strong>New Customer Email:</strong> ${newCustomerEmail}</p>
         
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0;">🏆 Keep Referring, Keep Earning!</h3>
        <p style="color: #555; line-height: 1.6;">
          Every successful referral brings you closer to amazing rewards. 
          Share your referral link with more friends and family!
        </p>
        
        <div style="text-align: center; margin-top: 15px;">
          <a href="${storeUrl}?ref=${referralCode}" 
             style="display: inline-block; background-color: #ffc107; color: #856404; 
                    padding: 10px 20px; text-decoration: none; border-radius: 5px; 
                    font-weight: bold;">
            📤 Copy Your Referral Link
          </a>
        </div>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #777;">Thank you for being a valuable part of Tornado Club! 🚀</p>
        <p style="color: #999; font-size: 12px;">This is an automated email. Please do not reply.</p>
      </div>
    </div>`;

    const mailOptions = {
      from: `"Tornado Club Referrals" <${smtpUser}>`,
      to: referrerEmail,
      subject: `🎉 Someone Shopped Using Your Referral - ${referralCode}`,
      html: emailHtml,
      text: `🎉 Someone Shopped Using Your Referral!\n\nGreat news! Someone has completed a purchase using your referral link.\n\n📊 REFERRAL DETAILS:\n• Your Referral Code: ${referralCode}\n• New Customer Email: ${newCustomerEmail}\n• Purchase Date: ${new Date().toLocaleDateString()}\n\n🏆 Keep Referring, Keep Earning!\nEvery successful referral brings you closer to amazing rewards.\n\nShare your referral link: ${storeUrl}?ref=${referralCode}\n\nThank you for being a valuable part of Tornado Club! 🚀\n\nThis is an automated email. Please do not reply.`,
    };

    console.log(`📤 Sending referral notification to referrer: ${referrerEmail}`);

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log(`✅ Referrer notification email sent:`, info.messageId);
    
    return { 
      sent: true, 
      emailId: info.messageId,
      to: referrerEmail,
      referralCode: referralCode
    };
    
  } catch (error) {
    console.error(`🔥 Referrer notification email error:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
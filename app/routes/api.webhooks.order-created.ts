// app/routes/api.webhooks.order-created.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

// ✅ ONLY order ID based deduplication - REMOVE referral code deduplication
const processedOrderIds = new Set();

// ✅ Helper function to get all environment variables
function getEnvVariables() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const referralApiBaseUrl = process.env.REFERRAL_API_BASE_URL;

  if (!shopDomain || !accessToken) {
    throw new Error("Shopify credentials not configured");
  }

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY not found in environment variables");
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
    resendApiKey,
    adminEmail,
    referralApiBaseUrl,
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

    // ✅ Referral code aur discount code extract karo
    let referralCode = null;
    let discountCode = null;

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

// ✅ NEW: MILESTONE EMAILS SEND KARNE KA FUNCTION WITH RATE LIMIT PROTECTION
async function sendMilestoneEmails(
  referrerEmail: string,
  referralCount: number,
  newCustomerEmail?: string,
) {
  try {
    console.log(`📧 Sending milestone emails for ${referralCount} referrals`);

    const emailsSent = [];

    // ✅ 1. REFERRER KO CONGRATULATIONS EMAIL
    const referrerEmailResult = await sendReferrerCongratulations(
      referrerEmail,
      referralCount,
    );
    emailsSent.push({
      to: referrerEmail,
      type: "congratulations",
      success: referrerEmailResult,
    });

    // ✅ 2. ADMIN KO NOTIFICATION EMAIL
    const adminEmailResult = await sendAdminNotification(
      referrerEmail,
      referralCount,
      newCustomerEmail,
    );
    emailsSent.push({
      to: "admin",
      type: "notification",
      success: adminEmailResult,
    });

    // ✅ 3. NEW CUSTOMER KO REWARD EMAIL (if available) - WITH DELAY FOR RATE LIMIT
    if (newCustomerEmail && newCustomerEmail !== referrerEmail) {
      // Add 1 second delay to avoid rate limit
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newCustomerEmailResult =
        await sendNewCustomerRewardEmail(newCustomerEmail);
      emailsSent.push({
        to: newCustomerEmail,
        type: "reward",
        success: newCustomerEmailResult,
      });
    }

    console.log(`✅ All emails sent:`, emailsSent);
    return emailsSent;
  } catch (error) {
    console.error("🔥 Milestone emails error:", error);
    return [];
  }
}

// ✅ REFERRER KO CONGRATULATIONS EMAIL - CLEAN & PROFESSIONAL
async function sendReferrerCongratulations(
  email: string,
  referralCount: number,
) {
  try {
    const { resendApiKey } = getEnvVariables();

    const emailData = {
      from: "Tornado Club <onboarding@resend.dev>",
      to: [email],
      subject: `🎉 Congratulations! ${referralCount} Referrals Completed`,
      html: `
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

      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0;">🎁 Your Reward is Ready!</h3>
        <p style="color: #555; line-height: 1.6;">
          A special reward has been unlocked and will be automatically applied to your next order.
        </p>
      </div>

      <!-- Added login requirement section -->
      <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; margin: 20px 0;">
        <h4 style="color: #004085; margin-top: 0;">🔐 Important Notice</h4>
        <p style="color: #004085; line-height: 1.6; margin-bottom: 0;">
          <strong>Please ensure you're logged into your account</strong> when placing your next order to automatically receive your reward.
        </p>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #777;">Thank you for being an amazing ambassador! ❤️</p>
        <p style="color: #999; font-size: 12px;">Tornado Club Team</p>
      </div>
    </div>
  `,
      text: `🎉 Congratulations!\n\nYou've reached ${referralCount} referrals!\n\nYour reward has been unlocked and will be applied to your next order automatically.\n\n🔐 Important: Please ensure you're logged into your account when placing your next order to receive your reward.\n\nThank you for your support!\n\nTornado Club Team`,
    };

    console.log(`📤 Sending congratulations email to referrer: ${email}`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Congratulations email sent to ${email}:`, data.id);
      return { sent: true, emailId: data.id };
    } else {
      const errorData = await response.text();
      console.error(`❌ Email failed for ${email}:`, errorData);
      return { sent: false, error: errorData };
    }
  } catch (error) {
    console.error(`🔥 Referrer email error for ${email}:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ ADMIN KO NOTIFICATION EMAIL - CLEAN & INFORMATIVE
async function sendAdminNotification(
  referrerEmail: string,
  referralCount: number,
  newCustomerEmail?: string,
) {
  try {
    const { resendApiKey, adminEmail } = getEnvVariables();

    const emailData = {
      from: "Tornado Club Alerts <onboarding@resend.dev>",
      to: [adminEmail],
      subject: `🔔 Referral Milestone: ${referralCount} Referrals`,
      html: `
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
        </div>
      `,
      text: `🔔 Referral Milestone Notification\n\nReferrer: ${referrerEmail}\nMilestone: ${referralCount} Referrals\nCustomer: ${newCustomerEmail || "N/A"}\nTime: ${new Date().toLocaleString()}\n\nAutomated actions completed successfully.\n\nNo action required.\n\nTornado Club Referral System`,
    };

    console.log(`📤 Sending admin notification email to: ${adminEmail}`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Admin notification email sent:`, data.id);
      return { sent: true, emailId: data.id };
    } else {
      const errorData = await response.text();
      console.error(`❌ Admin email failed:`, errorData);
      return { sent: false, error: errorData };
    }
  } catch (error) {
    console.error(`🔥 Admin email error:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ✅ NEW CUSTOMER KO REWARD EMAIL - SIMPLE WELCOME
async function sendNewCustomerRewardEmail(email: string) {
  try {
    const { resendApiKey } = getEnvVariables();

    const emailData = {
      from: "Tornado Club <onboarding@resend.dev>",
      to: [email],
      subject: `🎁 Welcome to Tornado Club!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333;">🎁 Welcome to Tornado Club!</h1>
          </div>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #155724; margin-top: 0;">Thanks for joining us!</h3>
            <p style="color: #155724; line-height: 1.6;">
              You'll receive a special reward on your next order as a thank you for joining through referral.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p>We're excited to have you in our community! 🚀</p>
            <p style="color: #777;">Tornado Club Team</p>
          </div>
        </div>
      `,
      text: `🎁 Welcome to Tornado Club!\n\nThanks for joining us through referral!\n\nYou'll receive a special reward on your next order.\n\nWe're excited to have you in our community! 🚀\n\nTornado Club Team`,
    };

    console.log(`📤 Sending welcome email to customer: ${email}`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Welcome email sent to ${email}:`, data.id);
      return { sent: true, emailId: data.id };
    } else {
      const errorData = await response.text();
      console.error(`❌ Welcome email failed for ${email}:`, errorData);
      return { sent: false, error: errorData };
    }
  } catch (error) {
    console.error(`🔥 Customer email error for ${email}:`, error);
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

// ✅ IMPROVED DISCOUNT CODE DELETE FUNCTION
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

// ✅ IMPROVED REWARD CHECK FUNCTION
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

// app/routes/api.webhooks.order-created.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

// ✅ In-memory storage for processed referral codes
const processedReferralCodes = new Set();

export async function action({ request }: ActionFunctionArgs) {
  try {
    const payload = await request.json();
    
    console.log("🛒 Order created webhook received");

    // ✅ Shopify order created webhook data
    const { id, name, note_attributes, financial_status } = payload;

    // ✅ Check if order is paid
    if (financial_status && financial_status !== 'paid') {
      console.log(`⏭️ Order ${id} is not paid (${financial_status}), skipping...`);
      return json({
        success: true,
        message: 'Order not paid, skipping processing',
        skipped: true
      }, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // ✅ Referral code aur discount code extract karo
    let referralCode = null;
    let discountCode = null;
    
    if (note_attributes && Array.isArray(note_attributes)) {
      // Referral code extract karo
      const referralAttr = note_attributes.find(attr => 
        attr.name === 'referral_code_used'
      );
      if (referralAttr) {
        referralCode = referralAttr.value;
      }

      // Discount code extract karo
      const discountAttr = note_attributes.find(attr => 
        attr.name === 'applied_discount_code'
      );
      if (discountAttr) {
        discountCode = discountAttr.value;
      }
    }

    // ✅ Agar referral code aur discount code mile to processing karo
    if (referralCode && discountCode) {
      console.log(`🎯 Found referral code: ${referralCode} with discount code: ${discountCode}`);
      
      // ✅ STEP 0: Check if this referral code already processed today (Idempotency)
      const today = new Date().toDateString();
      const referralKey = `${referralCode}_${today}`;
      
      if (processedReferralCodes.has(referralKey)) {
        console.log(`⏭️ Referral code ${referralCode} already processed today, skipping...`);
        return json({
          success: true,
          message: 'Referral code already processed today',
          skipped: true
        }, {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }
        });
      }

      // ✅ Mark referral code as processed for today
      processedReferralCodes.add(referralKey);
      console.log(`📝 Marked referral code ${referralCode} as processed for today`);
      
      // ✅ STEP 1: Specific discount code delete karo
      const discountDeleted = await deleteSpecificDiscountCode(discountCode, id);
      
      // ✅ STEP 2: Referral count update karo aur customer data get karo
      const referralResult = await updateReferralCount(referralCode);
      
      // ✅ STEP 3: Agar pehli successful referral hai to "Inviter" tag add karo
      if (referralResult.success && referralResult.newReferralCount === 1) {
        await addInviterTag(referralResult.customerId);
      }
      
      console.log(`✅ Order processing completed for referral ${referralCode}`);
      
      return json({
        success: true,
        message: `Discount code deleted and referral count updated for ${referralCode}`,
        orderId: id,
        orderName: name,
        discountDeleted: discountDeleted,
        referralUpdated: referralResult,
        inviterTagAdded: referralResult.newReferralCount === 1
      }, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    } else {
      console.log("ℹ️ No referral/discount data found in this order");
      return json({
        success: true,
        message: 'No referral/discount data found in order'
      }, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

  } catch (error) {
    console.error('🔥 Order webhook error:', error);
    return json({
      success: false,
      error: 'Webhook processing failed'
    }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  }
}

// ✅ "INVITER" TAG ADD KARNE KA FUNCTION
async function addInviterTag(customerId: string) {
  try {
    console.log(`🏷️ Adding "Inviter" tag to customer: ${customerId}`);

    // ✅ Shopify credentials
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      throw new Error("Shopify credentials not configured");
    }

    // ✅ Pehle current customer data get karo
    const customerResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        }
      }
    );

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      console.error("🔥 Customer fetch failed:", errorText);
      throw new Error(`Customer fetch failed: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();
    const customer = customerData.customer;

    // ✅ Current tags get karo
    const currentTags = customer.tags ? customer.tags.split(',').map((tag: string) => tag.trim()) : [];
    
    // ✅ Check if "Inviter" tag already exists
    if (currentTags.includes('Inviter')) {
      console.log(`ℹ️ Customer already has "Inviter" tag`);
      return true;
    }

    // ✅ "Inviter" tag add karo
    const newTags = [...currentTags, 'Inviter'].join(', ');

    // ✅ Customer update karo with new tags
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
            tags: newTags
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("🔥 Customer update failed:", errorText);
      throw new Error(`Customer update failed: ${updateResponse.status}`);
    }

    console.log(`✅ Successfully added "Inviter" tag to customer: ${customer.email}`);
    return true;

  } catch (error) {
    console.error('🔥 Add inviter tag error:', error);
    throw error;
  }
}

// ✅ SPECIFIC DISCOUNT CODE DELETE KARNE KA FUNCTION
async function deleteSpecificDiscountCode(discountCode: string, orderId: string) {
  try {
    console.log(`🗑️ Deleting specific discount code: ${discountCode}`);

    // ✅ Shopify credentials
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      throw new Error("Shopify credentials not configured");
    }

    // ✅ STEP 1: Saare price rules get karo
    const priceRulesResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/price_rules.json?limit=250`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        }
      }
    );

    if (!priceRulesResponse.ok) {
      const errorText = await priceRulesResponse.text();
      console.error("🔥 Price rules fetch failed:", errorText);
      throw new Error(`Price rules fetch failed: ${priceRulesResponse.status}`);
    }

    const priceRulesData = await priceRulesResponse.json();
    console.log("🔍 Total price rules found:", priceRulesData.price_rules?.length);

    // ✅ STEP 2: Specific discount code search karo
    if (priceRulesData.price_rules && priceRulesData.price_rules.length > 0) {
      for (const priceRule of priceRulesData.price_rules) {
        try {
          // ✅ Price rule ke discount codes get karo
          const discountCodesResponse = await fetch(
            `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.id}/discount_codes.json`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
              }
            }
          );

          if (discountCodesResponse.ok) {
            const discountCodesData = await discountCodesResponse.json();
            
            if (discountCodesData.discount_codes && discountCodesData.discount_codes.length > 0) {
              // ✅ Specific discount code search karo
              const targetDiscount = discountCodesData.discount_codes.find(
                (dc: { code: string }) => dc.code === discountCode
              );
              
              if (targetDiscount) {
                console.log(`🎯 Found exact discount code match: ${targetDiscount.code}`);
                
                // ✅ Price rule delete karo
                const deleteResponse = await fetch(
                  `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.id}.json`,
                  {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Shopify-Access-Token": accessToken,
                    }
                  }
                );

                if (deleteResponse.ok) {
                  console.log(`✅ Deleted specific discount code: ${discountCode}`);
                  
                  // ✅ Order note update karo
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
                            note: `✅ Referral processed. Discount code ${discountCode} deleted.`
                          }
                        })
                      }
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
          console.error(`🔥 Error processing price rule ${priceRule.id}:`, priceRuleError);
        }
      }
    }

    console.log(`❌ Discount code ${discountCode} not found`);
    return false;

  } catch (error) {
    console.error('🔥 Delete specific discount code error:', error);
    throw error;
  }
}

// ✅ REFERRAL COUNT UPDATE KARNE KA FUNCTION
async function updateReferralCount(referralCode: string) {
  try {
    console.log(`📈 Updating referral count for: ${referralCode}`);

    const response = await fetch('https://engineers-reaction-laura-variance.trycloudflare.com/api/update-referral-count', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        referralCode: referralCode
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Referral count update failed:", errorText);
      throw new Error(`Referral count update failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Referral count update result:", result);

    return result;

  } catch (error) {
    console.error('🔥 Update referral count error:', error);
    throw error;
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
      }
    });
  }
  
  return json({}, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}
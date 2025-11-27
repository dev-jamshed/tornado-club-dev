// app/routes/api.webhooks.order-created.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

// ✅ ONLY order ID based deduplication - REMOVE referral code deduplication
const processedOrderIds = new Set();

// ✅ Helper function to get Shopify credentials
function getShopifyCredentials() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!shopDomain || !accessToken) {
    throw new Error("Shopify credentials not configured");
  }
  
  return { shopDomain, accessToken };
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const payload = await request.json();
    
    console.log("🛒 Order created webhook received");

    // ✅ Shopify order created webhook data
    const { id, name, note_attributes, financial_status } = payload;

    // ✅ STEP 0: ORDER ID BASED DEDUPLICATION ONLY
    if (processedOrderIds.has(id)) {
      console.log(`⏭️ Order ${id} already processed, skipping...`);
      return json({
        success: true,
        message: 'Order already processed',
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

    // Mark order as processed
    processedOrderIds.add(id);
    console.log(`📝 Marked order ${id} as processed`);

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
      
      // ❌ REMOVED: Referral code based deduplication - yeh part completely hata do
      // ✅ Sirf order ID based deduplication rahega
      
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

    const { shopDomain, accessToken } = getShopifyCredentials();

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

// ✅ IMPROVED DISCOUNT CODE DELETE FUNCTION
async function deleteSpecificDiscountCode(discountCode: string, orderId: string) {
  try {
    console.log(`🗑️ Deleting specific discount code: ${discountCode}`);

    const { shopDomain, accessToken } = getShopifyCredentials();

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
      return false; // Return false but don't throw error
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
          continue; // Continue with next price rule
        }
      }
    }

    console.log(`❌ Discount code ${discountCode} not found`);
    return false;

  } catch (error) {
    console.error('🔥 Delete specific discount code error:', error);
    return false; // Return false but don't break the flow
  }
}

// ✅ REFERRAL COUNT UPDATE KARNE KA FUNCTION - REWARD SYSTEM ADD KIYA
async function updateReferralCount(referralCode: string) {
  try {
    console.log(`📈 Updating referral count for: ${referralCode}`);

    const response = await fetch('https://wallet-contrast-handhelds-nearby.trycloudflare.com/api/update-referral-count', {
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

    // ✅ NEW: REWARD SYSTEM CHECK KARO
    if (result.success && result.customerId) {
      await checkAndAssignRewards(result.customerId, result.newReferralCount);
    }

    return result;

  } catch (error) {
    console.error('🔥 Update referral count error:', error);
    throw error;
  }
}

// ✅ IMPROVED REWARD CHECK FUNCTION - DUPLICATE REWARDS HANDLE KARO
async function checkAndAssignRewards(customerId: string, currentReferralCount: number) {
  try {
    console.log(`🎁 Checking rewards for customer ${customerId} with ${currentReferralCount} referrals`);

    const { shopDomain, accessToken } = getShopifyCredentials();

    // ✅ STEP 1: Referral settings get karo
    let rewardLevels = [];
    try {
      const settingsResponse = await fetch('https://wallet-contrast-handhelds-nearby.trycloudflare.com/api/referral-setting', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        
        // Multiple possible data structures check karo
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

    // ✅ STEP 2: Customer data get karo
    let customer = null;
    try {
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

    // ✅ STEP 3: Check karo ke koi reward level match ho raha hai - DUPLICATES REMOVE KARO
    console.log(`🔍 Checking ${rewardLevels.length} reward levels against ${currentReferralCount} referrals`);
    
    // ✅ DUPLICATE REWARDS REMOVE KARO - sirf unique rewards process karo
    const uniqueRewards = rewardLevels.filter((reward: any, index: number, self: any[]) => 
      index === self.findIndex((r: any) => 
        (parseInt(r.referralCount) || 0) === (parseInt(reward.referralCount) || 0)
      )
    );

    const achievedRewards = uniqueRewards.filter((reward: any) => {
      const rewardCount = parseInt(reward.referralCount) || 0;
      const currentCount = parseInt(currentReferralCount.toString()) || 0;
      console.log(`Comparing: ${rewardCount} == ${currentCount} -> ${rewardCount === currentCount}`);
      return rewardCount === currentCount;
    });

    if (achievedRewards.length > 0) {
      console.log(`🎉 Customer achieved ${achievedRewards.length} reward levels at ${currentReferralCount} referrals!`);
      
      // ✅ STEP 4: Sirf pehla achieved reward process karo (duplicates avoid karo)
      const rewardToProcess = achievedRewards[0];
      await sendRewardNotification(customer, rewardToProcess, currentReferralCount);
    } else {
      console.log(`ℹ️ No reward levels achieved at ${currentReferralCount} referrals`);
      console.log(`Available levels:`, rewardLevels.map((r: any) => r.referralCount));
    }

  } catch (error) {
    console.error('🔥 Reward check error:', error);
  }
}

// ✅ UPDATED REWARD NOTIFICATION FUNCTION WITH BETTER EMAIL
async function sendRewardNotification(customer: any, reward: any, referralCount: number) {
  try {
    console.log(`📧 Sending reward notification for ${referralCount} referrals`);

    const { shopDomain, accessToken } = getShopifyCredentials();

    // ✅ STEP 1: PRODUCT NAME GET KARO
    let productName = "Special Reward";
    try {
      const productId = reward.referrerProduct.split('/').pop();
      const productResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          }
        }
      );

      if (productResponse.ok) {
        const productData = await productResponse.json();
        productName = productData.product.title;
        console.log(`📦 Product name resolved: ${productName}`);
      }
    } catch (productError) {
      console.error("❌ Error fetching product name:", productError);
    }

    // ✅ STEP 2: CLEAN NOTIFICATION MESSAGE
    const notificationMessage = `🎉 MILESTONE ACHIEVED! 

You've successfully referred ${referralCount} friends to our store! 

As a thank you, you've earned:
🏆 ${productName}

Your reward will be automatically applied to your next order.

Keep sharing the love! 💝`;

    // ✅ STEP 3: CUSTOMER NOTE UPDATE
    try {
      const customerResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          }
        }
      );

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        const currentCustomer = customerData.customer;
        
        // ✅ PURANE REFERRAL NOTES REMOVE KARO
        const currentNote = currentCustomer.note || '';
        const cleanedNote = currentNote
          .split('\n')
          .filter((line: string) => !line.includes('REFERRAL MILESTONE') && !line.includes('REFERRAL REWARD'))
          .join('\n')
          .trim();

        // ✅ ONLY CURRENT REWARD ADD KARO
        const newNote = `🎯 REFERRAL MILESTONE - ${referralCount} REFERRALS\n${notificationMessage}\n\n${cleanedNote}`.trim();

        // Note update karo
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
                note: newNote
              }
            })
          }
        );

        console.log(`✅ Reward note updated for ${customer.email}`);
      }
    } catch (noteError) {
      console.error("❌ Error updating customer note:", noteError);
    }

    // ✅ STEP 4: TRY MULTIPLE EMAIL METHODS
    let emailSent = false;
    
    // Method 1: Shopify Order Email
    try {
      emailSent = await sendShopifyEmail(customer, productName, referralCount);
    } catch (emailError) {
      console.error("❌ Shopify email failed:", emailError);
    }
    
    // Method 2: Fallback - Draft Order
    if (!emailSent) {
      try {
        emailSent = await sendTransactionalEmail(customer, productName, referralCount);
      } catch (draftError) {
        console.error("❌ Draft email also failed:", draftError);
      }
    }

    if (emailSent) {
      console.log(`✅ Email sent successfully to ${customer.email}`);
    } else {
      console.log(`⚠️ Email could not be sent to ${customer.email}`);
    }

    // ✅ STEP 5: ADMIN ALERT CREATE KARO
    try {
      await createAdminAlert(customer, productName, referralCount);
    } catch (adminError) {
      console.error("❌ Error creating admin alert:", adminError);
    }

    console.log(`✅ All notifications processed for ${customer.email}`);

  } catch (error) {
    console.error('🔥 Reward notification error:', error);
  }
}

// ✅ ALTERNATIVE EMAIL METHOD USING SHOPIFY'S BUILT-IN FEATURES
async function sendShopifyEmail(customer: any, productName: string, referralCount: number) {
  try {
    console.log(`📧 Using Shopify's email system for ${customer.email}`);

    const { shopDomain, accessToken } = getShopifyCredentials();

    // ✅ CREATE A $0 ORDER THAT TRIGGERS AUTOMATIC EMAIL
    const orderData = {
      order: {
        line_items: [
          {
            title: `Referral Reward - ${productName}`,
            quantity: 1,
            price: 0.00,
            requires_shipping: false,
            taxable: false
          }
        ],
        customer: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name
        },
        contact_email: customer.email,
        financial_status: "paid", // ✅ PAID STATUS TRIGGERS EMAIL
        fulfillment_status: null, // Don't fulfill
        tags: "Referral-Reward-Notification, Auto-Email",
        note: `🎉 CONGRATULATIONS!\n\nYou've reached ${referralCount} referrals!\nYour reward: ${productName}\n\nThis will be applied to your next order automatically.`,
        send_receipt: true, // ✅ THIS SHOULD TRIGGER EMAIL
        send_fulfillment_receipt: false,
        email: customer.email,
        billing_address: {
          first_name: customer.first_name,
          last_name: customer.last_name,
          address1: "123 Reward St", // Dummy address
          city: "Reward City",
          province: "ON",
          country: "CA",
          zip: "12345",
          phone: "123-456-7890"
        }
      }
    };

    const orderResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify(orderData)
      }
    );

    if (orderResponse.ok) {
      const orderResult = await orderResponse.json();
      console.log(`✅ Order created for email: ${orderResult.order.id}`);
      
      // ✅ Schedule order cancellation after email is sent
      setTimeout(async () => {
        try {
          await fetch(
            `https://${shopDomain}/admin/api/2024-01/orders/${orderResult.order.id}.json`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
              }
            }
          );
          console.log(`✅ Order ${orderResult.order.id} deleted after email`);
        } catch (cancelError) {
          console.error("❌ Error deleting order:", cancelError);
        }
      }, 30000); // 30 seconds delay
      
      return true;
    } else {
      const errorText = await orderResponse.text();
      console.error("❌ Order creation failed:", errorText);
      return false;
    }

  } catch (error) {
    console.error('🔥 Shopify email error:', error);
    return false;
  }
}

// ✅ REAL TRANSACTIONAL EMAIL FUNCTION
async function sendTransactionalEmail(customer: any, productName: string, referralCount: number) {
  try {
    console.log(`📧 Sending transactional email to ${customer.email}`);

    const { shopDomain, accessToken } = getShopifyCredentials();

    // ✅ METHOD 1: SIMPLE DRAFT ORDER WITH EMAIL
    const draftResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [
              {
                title: `🎉 You've Reached ${referralCount} Referrals!`,
                quantity: 1,
                price: 0.00,
                requires_shipping: false,
                properties: [
                  {
                    name: "Reward",
                    value: productName
                  },
                  {
                    name: "Referrals",
                    value: `${referralCount} friends`
                  }
                ]
              }
            ],
            customer: {
              id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name
            },
            email: customer.email, // ✅ Direct email set
            note: `Congratulations ${customer.first_name}! 🎉\n\nYou've successfully referred ${referralCount} friends to our store!\n\nYour Reward: ${productName}\n\nThis reward will be automatically applied to your next order.\n\nThank you for sharing the love! ❤️`,
            tags: "Referral-Reward-Notification",
            status: "completed"
          }
        })
      }
    );

    if (draftResponse.ok) {
      console.log(`✅ Draft order created for email to ${customer.email}`);
      return true;
    } else {
      console.error("❌ Draft order creation failed");
      
      // ✅ METHOD 2: FALLBACK - CUSTOMER METAFIELD
      try {
        await fetch(
          `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}/metafields.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              metafield: {
                namespace: "referral",
                key: "pending_reward_notification",
                value: JSON.stringify({
                  product: productName,
                  referralCount: referralCount,
                  date: new Date().toISOString(),
                  emailSent: false
                }),
                type: "json"
              }
            })
          }
        );
        console.log(`✅ Metafield created for pending email to ${customer.email}`);
      } catch (metaError) {
        console.error("❌ Metafield creation also failed");
      }
      
      return false;
    }

  } catch (error) {
    console.error('🔥 Transactional email error:', error);
    return false;
  }
}

// ✅ ADMIN ALERT FUNCTION
async function createAdminAlert(customer: any, productName: string, referralCount: number) {
  try {
    console.log(`📢 Creating admin alert`);

    const { shopDomain, accessToken } = getShopifyCredentials();

    // ✅ CREATE DRAFT ORDER AS ADMIN NOTIFICATION
    await fetch(
      `https://${shopDomain}/admin/api/2024-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [
              {
                title: `🎯 Customer Reached ${referralCount} Referrals`,
                quantity: 1,
                price: 0.00,
                requires_shipping: false
              }
            ],
            customer: {
              id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name
            },
            note: `🚀 REFERRAL MILESTONE ALERT!\n\nCustomer: ${customer.first_name} ${customer.last_name}\nEmail: ${customer.email}\nMilestone: ${referralCount} referrals\nReward: ${productName}\n\nThis is an automated alert.`,
            tags: "Referral-Milestone-Alert",
            status: "completed"
          }
        })
      }
    );

    console.log(`✅ Admin alert created for ${customer.email}`);

  } catch (error) {
    console.error('🔥 Admin alert error:', error);
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
// app/routes/api.update-referral-count.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { referralCode } = await request.json();

    console.log("📈 Updating referral count for:", { referralCode });

    // ✅ Shopify credentials
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      return json({
        success: false,
        error: "Shopify credentials not configured"
      }, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // ✅ STEP 1: Customer find karo jiska referral code hai
    const customerResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/customers.json?limit=250`,
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
      console.error("🔥 Customers fetch failed:", errorText);
      throw new Error(`Customers fetch failed: ${customerResponse.status}`);
    }

    const customersData = await customerResponse.json();
    console.log("🔍 Total customers found:", customersData.customers?.length);

    let targetCustomer = null;

    // ✅ STEP 2: Customer find karo jiska referral code match karta hai
    if (customersData.customers && customersData.customers.length > 0) {
      for (const customer of customersData.customers) {
        try {
          // ✅ Customer ke metafields get karo
          const metafieldsResponse = await fetch(
            `https://${shopDomain}/admin/api/2024-01/customers/${customer.id}/metafields.json`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
              }
            }
          );

          if (metafieldsResponse.ok) {
            const metafieldsData = await metafieldsResponse.json();
            
            if (metafieldsData.metafields && metafieldsData.metafields.length > 0) {
              // ✅ Referral code metafield find karo
              const referralCodeMetafield = metafieldsData.metafields.find(
                (mf: any) => mf.key === 'referral_code' && mf.value === referralCode
              );

              if (referralCodeMetafield) {
                targetCustomer = customer;
                console.log(`🎯 Found customer with referral code: ${customer.email}`);
                break;
              }
            }
          }
        } catch (customerError) {
          console.error(`🔥 Error checking customer ${customer.id}:`, customerError);
        }
      }
    }

    // ✅ STEP 3: Agar customer mila to referral count update karo
    if (targetCustomer) {
      console.log(`🔄 Updating referral count for customer: ${targetCustomer.email}`);
      
      // ✅ Pehle current referral count get karo
      const currentMetafieldsResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/customers/${targetCustomer.id}/metafields.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          }
        }
      );

      let currentReferralCount = 0;
      let referralCountMetafieldId = null;

      if (currentMetafieldsResponse.ok) {
        const currentMetafieldsData = await currentMetafieldsResponse.json();
        
        if (currentMetafieldsData.metafields && currentMetafieldsData.metafields.length > 0) {
          // ✅ Referral count metafield find karo
          const referralCountMetafield = currentMetafieldsData.metafields.find(
            (mf: any) => mf.key === 'referrals_count'
          );

          if (referralCountMetafield) {
            currentReferralCount = parseInt(referralCountMetafield.value) || 0;
            referralCountMetafieldId = referralCountMetafield.id;
          }
        }
      }

      // ✅ New referral count calculate karo
      const newReferralCount = currentReferralCount + 1;
      console.log(`📊 Referral count: ${currentReferralCount} → ${newReferralCount}`);

      // ✅ STEP 4: Referral count metafield update/create karo
      if (referralCountMetafieldId) {
        // ✅ Existing metafield update karo
        const updateResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-01/customers/${targetCustomer.id}/metafields/${referralCountMetafieldId}.json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              metafield: {
                id: referralCountMetafieldId,
                value: newReferralCount.toString(),
                type: "number_integer"
              }
            })
          }
        );

        if (updateResponse.ok) {
          console.log(`✅ Referral count updated to: ${newReferralCount}`);
        } else {
          console.error("🔥 Failed to update referral count metafield");
        }
      } else {
        // ✅ New metafield create karo
        const createResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-01/customers/${targetCustomer.id}/metafields.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              metafield: {
                namespace: "custom",
                key: "referrals_count",
                value: newReferralCount.toString(),
                type: "number_integer"
              }
            })
          }
        );

        if (createResponse.ok) {
          console.log(`✅ Referral count created: ${newReferralCount}`);
        } else {
          console.error("🔥 Failed to create referral count metafield");
        }
      }

      return json({
        success: true,
        message: `Referral count updated to ${newReferralCount} for customer ${targetCustomer.email}`,
        customerId: targetCustomer.id,
        customerEmail: targetCustomer.email,
        newReferralCount: newReferralCount
      }, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    } else {
      console.log("❌ No customer found with this referral code");
      return json({
        success: false,
        error: "No customer found with this referral code"
      }, {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

  } catch (error) {
    console.error("🔥 Update referral count error:", error);
    
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error"
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
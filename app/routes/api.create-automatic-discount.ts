// app/routes/api.create-automatic-discount.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { referralCode, productId } = await request.json();

    console.log("🎫 Creating automatic discount for:", {
      referralCode,
      productId,
    });

    // ✅ Shopify credentials
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      return json(
        {
          success: false,
          error: "Shopify credentials not configured",
          fallbackCode: "FREEPRODUCT",
        },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      );
    }

    // ✅ Generate random unique discount code
    const discountCode = `REF${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    console.log("💰 Generated unique discount code:", discountCode);

    // ✅ Create price rule in Shopify with referral code in title
    const priceRuleResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/price_rules.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          price_rule: {
            title: `Referral Discount - ${referralCode} - ${discountCode}`,
            target_type: "line_item",
            target_selection: "entitled",
            allocation_method: "across",
            value_type: "percentage",
            value: -100, // 100% discount
            customer_selection: "all",
            starts_at: new Date().toISOString(),
            // ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
            ends_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
            entitled_product_ids: [parseInt(productId)],
          },
        }),
      },
    );

    if (!priceRuleResponse.ok) {
      const errorText = await priceRuleResponse.text();
      console.error("🔥 Price rule creation failed:", errorText);
      throw new Error(
        `Price rule creation failed: ${priceRuleResponse.status}`,
      );
    }

    const priceRuleData = await priceRuleResponse.json();
    console.log("✅ Price rule created:", priceRuleData.price_rule.id);

    // ✅ Create discount code with random unique code
    const discountCodeResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRuleData.price_rule.id}/discount_codes.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          discount_code: {
            code: discountCode,
          },
        }),
      },
    );

    if (!discountCodeResponse.ok) {
      const errorText = await discountCodeResponse.text();
      console.error("🔥 Discount code creation failed:", errorText);
      throw new Error(
        `Discount code creation failed: ${discountCodeResponse.status}`,
      );
    }

    const discountCodeData = await discountCodeResponse.json();
    console.log(
      "✅ Discount code created:",
      discountCodeData.discount_code.code,
    );

    return json(
      {
        success: true,
        discountCode: discountCode,
        priceRuleId: priceRuleData.price_rule.id,
        // expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    );
  } catch (error) {
    console.error("🔥 Discount creation error:", error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        fallbackCode: "FREEPRODUCT",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    );
  }
}

// ✅ Handle OPTIONS for CORS Preflight
export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
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
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}

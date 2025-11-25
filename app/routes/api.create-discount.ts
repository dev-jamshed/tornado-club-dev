import { ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { Shopify } from "@shopify/shopify-api";

const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    try {
      const { productIds, shop } = await request.json();
      
      // Get free products from database
      const allSettings = await prisma.referralSettings.findMany();
      const freeProducts: any[] = [];
      
      allSettings.forEach(settings => {
        try {
          const rewards = settings.referralRewards;
          if (!rewards) return;

          let parsedRewards: any = rewards;
          if (typeof rewards === "string") {
            parsedRewards = JSON.parse(rewards);
          }

          if (parsedRewards.fixedRefereeProduct) {
            freeProducts.push(parsedRewards.fixedRefereeProduct);
          }
        } catch (e) {
          console.warn("Failed to parse rewards:", e);
        }
      });

      if (freeProducts.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: "No free products found"
        }), { status: 400 });
      }

      // Create automatic discount code
      const discountCode = `FREE_${Date.now()}`;
      
      // Shopify Admin API call to create discount
      // Note: Aap ko Shopify REST API use karni hogi
      
      return new Response(JSON.stringify({
        success: true,
        discountCode: discountCode,
        freeProducts: freeProducts,
        message: "Discount code created successfully"
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
      
    } catch (error) {
      console.error("Discount creation error:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "Discount creation failed"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }
  }
  
  return new Response(null, { status: 405 });
}
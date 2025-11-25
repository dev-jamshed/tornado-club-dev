import { ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    try {
      const { cartId } = await request.json();
      
      // Get free products
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

      // Yahan aap Shopify Admin API use kar ke discount apply kar sakte hain
      // Ya phir cart update kar sakte hain

      return new Response(JSON.stringify({
        success: true,
        message: "Discount processing initiated",
        freeProducts: freeProducts
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
      
    } catch (error) {
      console.error("Discount apply error:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "Discount application failed"
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
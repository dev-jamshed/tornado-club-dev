import { LoaderFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  try {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const allSettings = await prisma.referralSettings.findMany();
    
    const allReferralProducts: string[] = [];

    allSettings.forEach(settings => {
      try {
        const rewards = settings.referralRewards;
        if (!rewards) return;

        // Parse rewards
        let parsedRewards: any = rewards;
        
        if (typeof rewards === "string") {
          parsedRewards = JSON.parse(rewards);
        }

        // Sirf fixedRefereeProduct extract karein - jo hai wahi return karein
        if (parsedRewards.fixedRefereeProduct) {
          allReferralProducts.push(parsedRewards.fixedRefereeProduct);
        }

      } catch (e) {
        console.warn("Failed to parse for shop:", settings.shop, e);
      }
    });

    return Response.json({
      success: true,
      data: {
        fixedRefereeProducts: allReferralProducts,
        timestamp: new Date().toISOString()
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("API Error:", error);
    return Response.json({
      success: false,
      data: {
        fixedRefereeProducts: [],
        timestamp: new Date().toISOString()
      },
      error: "Failed to load referral products"
    }, { 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS", 
        "Access-Control-Allow-Headers": "Content-Type",
      }, 
      status: 500 
    });
  } finally {
    await prisma.$disconnect();
  }
}
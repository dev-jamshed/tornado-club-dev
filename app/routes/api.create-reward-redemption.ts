import { type ActionFunctionArgs, json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

// Prisma client initialization
const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  try {
    // ✅ CORS Preflight Check
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

    // ✅ Validate Request Method
    if (request.method !== "POST") {
      return json(
        { success: false, error: "Method not allowed" },
        { status: 405 }
      );
    }

    // ✅ Parse Request Body
    const payload = await request.json();
    
    const {
      referralCode,
      customerEmail,
      customerName = "Customer",
      referralCount
    } = payload;

    console.log("🎁 CREATE REWARD REDEMPTION REQUEST:", {
      referralCode,
      customerEmail,
      customerName,
      referralCount,
      timestamp: new Date().toISOString()
    });

    // ✅ Validate Required Fields
    if (!referralCode || !customerEmail || !referralCount) {
      return json({
        success: false,
        error: "Missing required fields",
        required: ["referralCode", "customerEmail", "referralCount"]
      }, { status: 400 });
    }

    // ✅ 1. CHECK IF REFERRAL CODE EXISTS IN ANY TABLE
    let referralExists = await prisma.referralCode.findUnique({
      where: { referralCode }
    });

    // Alternative check if not found in referralCode table
   

    // ✅ 2. CHECK FOR EXISTING REWARD REDEMPTION
    const existingRedemption = await prisma.rewardRedemption.findUnique({
      where: { referralCode }
    });

    if (existingRedemption) {
      console.log(`🔄 Updating existing reward redemption for: ${referralCode}`);
      
      // Update existing redemption
      const updatedRedemption = await prisma.rewardRedemption.update({
        where: { referralCode },
        data: {
          referralCount: parseInt(referralCount.toString()),
          rewardStatus: "pending",
          updatedAt: new Date(),
          // Only generate new claim link if not exists
          claimLink: generateClaimLink(referralCode)
        }
      });

      return json({
        success: true,
        message: "Reward redemption updated successfully",
        data: updatedRedemption,
        existing: true
      });
    }

    // ✅ 3. CREATE NEW REWARD REDEMPTION
    const rewardSessionId = generateSessionId();
    const claimLink = generateClaimLink(referralCode);

    const newRedemption = await prisma.rewardRedemption.create({
      data: {
        referralCode,
        customerEmail,
        customerName,
        referralCount: parseInt(referralCount.toString()),
        rewardSessionId,
        rewardStatus: "pending",
        claimLink
      }
    });

    console.log("✅ NEW REWARD REDEMPTION CREATED:", {
      id: newRedemption.id,
      referralCode: newRedemption.referralCode,
      customerEmail: newRedemption.customerEmail,
      claimLink: newRedemption.claimLink
    });

    return json({
      success: true,
      message: "Reward redemption created successfully",
      data: newRedemption,
      existing: false
    });

  } catch (error) {
    console.error("🔥 CREATE REWARD REDEMPTION ERROR:", error);
    
    return json({
      success: false,
      error: "Failed to create reward redemption",
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
    
  } finally {
    // Prisma client close karein
    await prisma.$disconnect();
  }
}

// ✅ HELPER: GENERATE CLAIM LINK (Simplified)
function generateClaimLink(referralCode: string): string {
//   const baseUrl = process.env.SHOPIFY_SHOP_DOMAIN || "tornado-club-dev.myshopify.com";
const baseUrl = "tornado-club-dev.myshopify.com";
  const token = Buffer.from(`${referralCode}:${Date.now()}`).toString('base64');
  return `${baseUrl}?claim_reward=${token}`;
}

// ✅ HELPER: GENERATE SESSION ID
function generateSessionId(): string {
  return `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ✅ CORS SUPPORT FOR GET REQUESTS
export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return json(
    { 
      message: "Use POST to create reward redemption",
      endpoint: "/api/create-reward-redemption",
      method: "POST",
      required_body: {
        referralCode: "string",
        customerEmail: "string",
        customerName: "string (optional)",
        referralCount: "number"
      }
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}
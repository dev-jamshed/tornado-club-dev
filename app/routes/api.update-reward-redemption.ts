// app/routes/api.update-reward-redemption.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

// Prisma client initialization
const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  try {
    // ✅ CORS Preflight
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

    // ✅ POST Method Only
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
      status = "redeemed" // Default: redeemed
    } = payload;

    console.log("🔄 UPDATE REWARD STATUS REQUEST:", {
      referralCode,
      status
    });

    // ✅ Validate Required Fields
    if (!referralCode) {
      return json({
        success: false,
        error: "Missing required field: referralCode",
        isValid: false
      }, { status: 400 });
    }

    // ✅ Find Reward Redemption by referralCode
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { referralCode }
    });

    if (!redemption) {
      return json({
        success: false,
        error: `Reward redemption not found for referral code: ${referralCode}`,
        isValid: false,
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    // ✅ Check if already redeemed
    if (redemption.rewardStatus === "redeemed" && status === "redeemed") {
      return json({
        success: false,
        error: "Reward already redeemed",
        isValid: false,
        code: "ALREADY_REDEEMED",
        data: {
          referralCode: redemption.referralCode,
          currentStatus: redemption.rewardStatus
        }
      }, { status: 400 });
    }

    // ✅ Prepare Update Data
    const updateData: any = {
      rewardStatus: status,
      updatedAt: new Date()
    };

    // Set redeemedAt if status is redeemed
    if (status === "redeemed") {
      updateData.redeemedAt = new Date();
    }

    // ✅ Update Reward Redemption
    const updatedRedemption = await prisma.rewardRedemption.update({
      where: { referralCode },
      data: updateData
    });

    console.log("✅ REWARD STATUS UPDATED:", {
      referralCode,
      oldStatus: redemption.rewardStatus,
      newStatus: updatedRedemption.rewardStatus
    });

    return json({
      success: true,
      message: `Reward status updated to: ${status}`,
      isValid: true,
      data: {
        referralCode: updatedRedemption.referralCode,
        oldStatus: redemption.rewardStatus,
        newStatus: updatedRedemption.rewardStatus,
        redeemedAt: updatedRedemption.redeemedAt
      }
    });

  } catch (error) {
    console.error("🔥 UPDATE REWARD STATUS ERROR:", error);
    
    return json({
      success: false,
      error: "Failed to update reward status",
      isValid: false,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
    
  } finally {
    // Prisma client close
    await prisma.$disconnect();
  }
}

// ✅ Optional: GET endpoint to check status
export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return json({
    message: "Reward Redemption Status Update API",
    POST_endpoint: "/api/update-reward-redemption",
    POST_body: {
      referralCode: "string (required)",
      status: "string (redeemed/pending/expired/cancelled)"
    },
    example: {
      referralCode: "TC-12345",
      status: "redeemed"
    }
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
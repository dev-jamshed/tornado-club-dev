import { type ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type VerifyClaimRequestBody = {
  token: string;
};

// ✅ Simple function to get product based on referral count
async function getProductFromReferralCount(referralCount: number) {
  try {
    // ✅ Get referral settings
    const referralSettings = await prisma.referralSettings.findFirst();
    
    if (!referralSettings || !referralSettings.referralRewards) {
      console.log("❌ No referral settings or rewards found");
      return null;
    }

    // ✅ Parse referral rewards (new structure)
    const settingsData = referralSettings.referralRewards as {
      rewards?: Array<{
        id: number;
        referralCount: string; // This is string in database
        referrerProduct: string; // Shopify product ID
      }>;
      fixedRefereeProduct?: string;
    };

    // ✅ Check if rewards exist
    if (!settingsData.rewards || !Array.isArray(settingsData.rewards) || settingsData.rewards.length === 0) {
      console.log("❌ No rewards configured in settings");
      return null;
    }

    console.log("User's referral count:", referralCount);
    console.log("Available rewards:", settingsData.rewards);

    // ✅ Convert user's referral count to number for comparison
    const userCount = referralCount;

    // ✅ Sort by referralCount (convert to number for sorting)
    const sortedRewards = settingsData.rewards.sort((a, b) => {
      const aCount = parseInt(a.referralCount) || 0;
      const bCount = parseInt(b.referralCount) || 0;
      return aCount - bCount;
    });

    console.log("Sorted rewards:", sortedRewards);
    
    // ✅ Find highest reward that user qualifies for
    let matchedReward = null;
    
    for (const reward of sortedRewards) {
      const requiredCount = parseInt(reward.referralCount) || 0;
      
      if (userCount >= requiredCount) {
        matchedReward = reward;
        console.log(`✅ User qualifies for: ${requiredCount} referrals -> Product: ${reward.referrerProduct}`);
      } else {
        break; // Stop since rewards are sorted ascending
      }
    }

    if (matchedReward) {
      return {
        referralCountRequired: parseInt(matchedReward.referralCount),
        productId: matchedReward.referrerProduct,
        description: `Earned for ${matchedReward.referralCount} referrals`,
        // Extract product ID from Shopify GID
        shopifyProductId: matchedReward.referrerProduct.replace('gid://shopify/Product/', ''),
        rewardId: matchedReward.id
      };
    } else {
      console.log("⚠️ User doesn't qualify for any reward yet");
      return null;
    }

  } catch (error) {
    console.error("Error in getProductFromReferralCount:", error);
    return null;
  }
}

// ✅ CORS RESPONSE HELPER
function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  }

  try {
    if (request.method !== "POST") {
      return corsResponse({
        success: false,
        error: "Method not allowed"
      }, 405);
    }

    const payload = await request.json() as VerifyClaimRequestBody;
    const { token } = payload;

    console.log("🔍 VERIFY CLAIM REWARD REQUEST:", {
      tokenPreview: token?.substring(0, 20),
      timestamp: new Date().toISOString()
    });

    // ✅ 1. VALIDATE INPUT
    if (!token) {
      return corsResponse({
        success: false,
        isValid: false,
        error: "Missing token",
        required: ["token"]
      }, 400);
    }

    // ✅ 2. DECODE TOKEN
    let referralCode = "";
    let tokenTimestamp = 0;
    
    try {
      const decoded = atob(token);
      const parts = decoded.split(':');
      
      if (parts.length >= 2) {
        referralCode = parts[0];
        tokenTimestamp = parseInt(parts[1]) || 0;
      } else {
        referralCode = decoded;
      }
      
      console.log("🔐 Decoded token:", {
        referralCode,
        tokenTimestamp: tokenTimestamp ? new Date(tokenTimestamp).toLocaleString() : "N/A"
      });
      
    } catch (decodeError) {
      console.error("❌ Token decode error:", decodeError);
      return corsResponse({
        success: false,
        isValid: false,
        error: "Invalid token format"
      }, 400);
    }

    // ✅ 3. CHECK TOKEN EXPIRY (Optional - 7 days)
    if (tokenTimestamp > 0) {
      const tokenAgeInDays = Math.floor((Date.now() - tokenTimestamp) / (1000 * 60 * 60 * 24));
      if (tokenAgeInDays > 7) {
        return corsResponse({
          success: false,
          isValid: false,
          error: "Claim link has expired (7 days limit)",
          tokenAgeDays: tokenAgeInDays
        }, 410);
      }
    }

    // ✅ 4. CHECK REWARD REDEMPTION STATUS
    if (!referralCode) {
      return corsResponse({
        success: false,
        isValid: false,
        error: "Could not extract referral code from token"
      }, 400);
    }

   const rewardRedemption = await prisma.rewardRedemption.findFirst({
  where: {
    referralCode,
    rewardStatus: {
      not: "redeemed"
    }
  }
});


    if (!rewardRedemption) {
      return corsResponse({
        success: false,
        isValid: false,
        error: "No reward redemption found",
        referralCode
      }, 404);
    }

    console.log("✅ Reward redemption found:", {
      id: rewardRedemption.id,
      referralCode: rewardRedemption.referralCode,
      referralCount: rewardRedemption.referralCount,
      status: rewardRedemption.rewardStatus
    });

    // ✅ 5. GET PRODUCT FROM REFERRAL COUNT
    const matchedProduct = await getProductFromReferralCount(rewardRedemption.referralCount);
    
    console.log("🎁 Matched product result:", matchedProduct);

    // ✅ 6. PREPARE RESPONSE DATA
    const responseData: any = {
      referralCode: rewardRedemption.referralCode,
      customerEmail: rewardRedemption.customerEmail,
      customerName: rewardRedemption.customerName,
      referralCount: rewardRedemption.referralCount,
      rewardStatus: rewardRedemption.rewardStatus,
      claimLink: rewardRedemption.claimLink,
      isPending: rewardRedemption.rewardStatus === "pending",
      isClaimed: rewardRedemption.rewardStatus === "claimed",
      isRedeemed: rewardRedemption.rewardStatus === "redeemed",
      claimedAt: rewardRedemption.claimedAt,
      redeemedAt: rewardRedemption.redeemedAt,
      createdAt: rewardRedemption.createdAt,
    };

    // ✅ ADD PRODUCT INFO IF AVAILABLE
    if (matchedProduct) {
      responseData.matchedProduct = matchedProduct;
      responseData.hasReward = true;
      responseData.eligibleProductId = matchedProduct.productId;
      responseData.eligibleShopifyProductId = matchedProduct.shopifyProductId;
    } else {
      responseData.hasReward = false;
      responseData.message = "No reward product matched for current referral count";
    }
    // console.log("product info", responseData.matchedProduct);

    // ✅ 7. RETURN RESPONSE
    return corsResponse({
      success: true,
      isValid: true,
      message: "Claim reward verified successfully",
      data: responseData
    });

  } catch (error: any) {
    console.error("🔥 VERIFY CLAIM REWARD ERROR:", error);
    
    return corsResponse({
      success: false,
      isValid: false,
      error: "Failed to verify claim reward",
      details: error.message || String(error)
    }, 500);
    
  } finally {
    await prisma.$disconnect();
  }
}

// ✅ GET METHOD FOR TESTING
export async function loader() {
  return corsResponse({ 
    success: true, 
    message: "Claim reward verification API is running",
    endpoint: "/api/verify-claim-reward",
    method: "POST",
    required_body: {
      token: "base64_encoded_token"
    },
    example_request: {
      token: "VEVTVC1DT0RFOjE3MDE2MzQ1Njc4OTA="
    },
    timestamp: new Date().toISOString()
  });
}
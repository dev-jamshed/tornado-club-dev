import { ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

export async function loader() {
  return corsResponse({ 
    success: true, 
    message: "Referral verification API is running",
    timestamp: new Date().toISOString()
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
    const { referralCode } = await request.json();
    
    console.log("🔍 VERIFYING REFERRAL CODE:", referralCode);

    if (!referralCode) {
      return corsResponse({
        success: false,
        isValid: false,
        reason: "No referral code provided"
      });
    }

    // ✅ DATABASE SE REFERRAL CODE VERIFY KAREIN
    const referralData = await prisma.referralCode.findUnique({
      where: { referralCode: referralCode }
    });

    console.log("📊 VERIFICATION RESULT:", referralData ? "VALID" : "INVALID");

    if (!referralData) {
      return corsResponse({
        success: true,
        isValid: false,
        reason: "Referral code not found"
      });
    }

    // ✅ VALID REFERRAL CODE
    return corsResponse({
      success: true,
      isValid: true,
      reason: "Valid referral code",
      referralCode: referralCode,
      customer: {
        name: referralData.customerName,
        email: referralData.customerEmail
      },
      stats: {
        referralCount: referralData.referralCount
      }
    });

  } catch (error: any) {
    console.error('🔥 VERIFICATION ERROR:', error);
    return corsResponse({
      success: false,
      error: "Service unavailable",
      isValid: false
    }, 500);
  } finally {
    await prisma.$disconnect();
  }
}
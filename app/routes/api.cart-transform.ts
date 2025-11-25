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
  const referralData = await prisma.referralCode.findMany();

  return corsResponse({ 
    success: true, 
    message: "Referral verification API is running",
    data: referralData,
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
    const { referralCode, getLocalStorage } = await request.json();
    
    console.log("🔍 VERIFYING REFERRAL CODE:", referralCode);
    console.log("📦 GET LOCALSTORAGE REQUEST:", getLocalStorage);

    // Agar referral code nahi hai aur localStorage data chahiye
    if (!referralCode && getLocalStorage) {
      console.log("🔄 Returning localStorage simulation data");
      
      // Yahan aap database se actual user data get kar sakte hain
      // Temporary: Hardcoded referral codes return karenge
      const allReferralCodes = await prisma.referralCode.findMany();
      const validCodes = allReferralCodes.map(code => code.referralCode);
      
      return corsResponse({
        success: true,
        localStorageData: {
          referralCode: validCodes[0] || null, // First valid code return karenge
          availableCodes: validCodes,
          timestamp: new Date().toISOString()
        },
        message: "LocalStorage simulation data returned"
      });
    }

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
      },
      // Additional data for extension
      freeProductsEligible: true,
      localStorageAvailable: true
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
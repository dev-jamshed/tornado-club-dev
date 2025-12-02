import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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

// ✅ LOADER - SAB REFERRAL CODES GET KAREIN AUR SINGLE CODE CHECK KAREIN
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const referralCode = url.searchParams.get('code');
    
    // Agar specific code diya hai toh woh check karein
    if (referralCode) {
      console.log(`🔍 Checking referral code: ${referralCode}`);
      
      const referralData = await prisma.referralCode.findUnique({
        where: { referralCode: referralCode }
      });
      
      return corsResponse({
        success: true,
        data: referralData,
        found: !!referralData,
        exists: !!referralData,
        message: referralData ? "Referral code found" : "Referral code not found"
      });
    }
    
    // Agar koi code nahi diya, toh sab codes get karein
    const allReferrals = await prisma.referralCode.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    return corsResponse({
      success: true,
      count: allReferrals.length,
      data: allReferrals,
      message: `Found ${allReferrals.length} referral codes`
    });

  } catch (error: any) {
    console.error('🔥 LOADER ERROR:', error);
    return corsResponse({
      success: false,
      error: "Failed to fetch referral data"
    }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

// ✅ ACTION - NEW REFERRAL CODE CREATE KAREIN
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
    const { customerId, customerName, customerEmail, referralCode } = await request.json();

    console.log("📝 CREATE REFERRAL - DATA RECEIVED:", {
      customerId, customerName, customerEmail, referralCode
    });

    if (!customerId || !referralCode) {
      return corsResponse({
        success: false,
        error: "customerId and referralCode are required"
      }, 400);
    }

    // ✅ PEHLE CHECK KAREIN KE CODE EXIST KARTA HAI YA NAHI
    const existingReferral = await prisma.referralCode.findUnique({
      where: { referralCode: referralCode }
    });

    if (existingReferral) {
      console.log("✅ Referral code already exists:", existingReferral);
      return corsResponse({
        success: true,
        message: "Referral code already exists",
        existing: true,
        data: existingReferral
      });
    }

    // ✅ APNE REFERRALCODE TABLE MEIN DATA INSERT KAREIN
    const referral = await prisma.referralCode.create({
      data: {
        customerId: customerId.toString(),
        customerName: customerName || "Unknown Customer",
        customerEmail: customerEmail || "unknown@example.com",
        referralCode: referralCode,
        referralLink: `https://tornado-club-dev.myshopify.com?ref=${referralCode}`,
        referralCount: 0
      }
    });

    console.log("✅ DATABASE MEIN NEW ENTRY CREATE HO GAYA:", referral);

    return corsResponse({
      success: true,
      message: "Referral data saved to database",
      existing: false,
      referralId: referral.id,
      referralCode: referral.referralCode,
      data: referral
    });

  } catch (error: any) {
    console.error('🔥 DATABASE INSERT ERROR:', error);
    
    if (error.code === 'P2002') {
      // Unique constraint violation
      return corsResponse({
        success: true,
        message: "Referral code already exists",
        existing: true
      });
    }
    
    return corsResponse({
      success: false,
      error: "Failed to save referral data",
      details: error.message
    }, 500);
  } finally {
    await prisma.$disconnect();
  }
}
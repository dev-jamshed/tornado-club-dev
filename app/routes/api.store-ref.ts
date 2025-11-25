import { ActionFunctionArgs, LoaderFunction } from "@remix-run/node";
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

// GET - Lifetime session se referral code get karen
export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop') || 'tornado-club-dev';
    const sessionId = url.searchParams.get('sessionId');
    
    console.log('🔍 Fetching lifetime session:', sessionId);
    
    const settings = await prisma.referralSettings.findUnique({
      where: { shop: shop }
    });
    
    let userReferralCode = null;
    let sessionData = null;
    
    if (settings?.referralRewards) {
      try {
        const rewards = typeof settings.referralRewards === 'string' 
          ? JSON.parse(settings.referralRewards)
          : settings.referralRewards;
        
        // ✅ SAFE LIFETIME SESSIONS CHECK KAREN
        if (rewards && typeof rewards === 'object' && 'lifetimeSessions' in rewards) {
          const lifetimeSessions = rewards.lifetimeSessions;
          if (lifetimeSessions && typeof lifetimeSessions === 'object' && sessionId && sessionId in lifetimeSessions) {
            userReferralCode = lifetimeSessions[sessionId].referralCode;
            sessionData = lifetimeSessions[sessionId];
            console.log('✅ Lifetime session found for user:', sessionId);
          }
        }
      } catch (e) {
        console.log('Error parsing rewards:', e);
      }
    }
    
    return corsResponse({
      success: true,
      sessionData: {
        referralCode: userReferralCode,
        sessionData: sessionData,
        sessionId: sessionId,
        hasReferral: !!userReferralCode,
        sessionType: 'lifetime'
      },
      message: userReferralCode ? "Lifetime referral found" : "No lifetime referral"
    });
    
  } catch (error) {
    console.error('Lifetime session fetch error:', error);
    return corsResponse({
      success: false,
      error: "Session fetch failed"
    }, 500);
  } finally {
    await prisma.$disconnect();
  }
};

// POST - Lifetime session mein store karen
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { refCode, sessionId, shop = 'tornado-club-dev', sessionType = 'lifetime' } = await request.json();
    
    if (refCode && sessionId) {
      console.log('💾 Storing lifetime session:', sessionId);
      
      const settings = await prisma.referralSettings.findUnique({
        where: { shop: shop }
      });
      
      // ✅ SAFE EXISTING REWARDS HANDLING
      let existingRewards: any = {};
      if (settings?.referralRewards) {
        try {
          existingRewards = typeof settings.referralRewards === 'string' 
            ? JSON.parse(settings.referralRewards)
            : settings.referralRewards;
        } catch (e) {
          console.log('Error parsing existing rewards:', e);
          existingRewards = {};
        }
      }
      
      // ✅ SAFE LIFETIME SESSIONS CREATION
      const existingLifetimeSessions = (existingRewards && typeof existingRewards === 'object' && 'lifetimeSessions' in existingRewards) 
        ? existingRewards.lifetimeSessions 
        : {};
      
      const updatedRewards = {
        ...existingRewards,
        lifetimeSessions: {
          ...existingLifetimeSessions,
          [sessionId]: {
            referralCode: refCode,
            storedAt: new Date().toISOString(),
            sessionType: 'lifetime',
            source: 'url_parameter',
            shop: shop
          }
        }
      };
      
      await prisma.referralSettings.upsert({
        where: { shop: shop },
        update: { referralRewards: updatedRewards },
        create: { shop: shop, referralRewards: updatedRewards }
      });
      
      console.log('✅ Lifetime session storage successful');
      
      return new Response(JSON.stringify({
        success: true,
        message: "Lifetime referral session stored",
        refCode: refCode,
        sessionId: sessionId,
        sessionType: 'lifetime',
        storedAt: new Date().toISOString(),
        validForever: true
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        }
      });
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: "No referral code or session ID"
    }), { 
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      }
    });
    
  } catch (error: any) {
    console.error('🔥 Lifetime session storage error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: "Lifetime storage failed: " + error.message
    }), { 
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}
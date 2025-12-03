import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ----------- Types -----------
type ReferralReward = {
  id?: string;
  referralCount: number;
  rewardType: string;
  rewardValue: number;
  createdAt?: string;
};

type ReferralSettingsResponse = {
  referralRewards: ReferralReward[];
};

type ActionBody = {
  method: "create" | "update" | "delete";
  referralRewards?: ReferralReward[];
};

// ✅ CORS RESPONSE HELPER
function corsResponse(body: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      ...headers
    },
  });
}

// ✅ OPTIONS HANDLER FOR CORS PREFLIGHT
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return corsResponse({}, 200);
  }

  try {
    const settings = await prisma.referralSettings.findFirst();

    return corsResponse({
      success: true,
      data: {
        referralRewards: (settings?.referralRewards as ReferralReward[]) || [],
      },
    });
  } catch (error) {
    return corsResponse({
      success: true,
      data: { referralRewards: [] },
    });
  }
}

// =============================
// POST - Create / Update / Delete
// =============================
export async function action({ request }: ActionFunctionArgs) {
  // ✅ HANDLE OPTIONS REQUEST
  if (request.method === "OPTIONS") {
    return corsResponse({}, 200);
  }

  try {
    const body = (await request.json()) as ActionBody;
    const { referralRewards, method } = body;

    // CREATE
    if (method === "create") {
      const created = await prisma.referralSettings.create({
        data: {
          shop: "global", // simple fixed value
          referralRewards: referralRewards || [],
        },
      });

      return corsResponse({
        success: true,
        message: "Created Successfully",
        data: created,
      });
    }

    // UPDATE (Safe version)
    if (method === "update") {
      const existingSettings = await prisma.referralSettings.findFirst();

      let result;

      if (existingSettings) {
        // update existing
        result = await prisma.referralSettings.update({
          where: { id: existingSettings.id },
          data: {
            referralRewards: referralRewards || [],
            updatedAt: new Date(),
          },
        });
      } else {
        // create new if not exist
        result = await prisma.referralSettings.create({
          data: {
            shop: "global",
            referralRewards: referralRewards || [],
          },
        });
      }

      return corsResponse({
        success: true,
        message: existingSettings ? "Updated Successfully" : "Created Successfully",
        data: result,
      });
    }

    // DELETE
    if (method === "delete") {
      const existingSettings = await prisma.referralSettings.findFirst();
      
      if (existingSettings) {
        await prisma.referralSettings.delete({
          where: { id: existingSettings.id },
        });
      }

      return corsResponse({
        success: true,
        message: "Deleted Successfully",
      });
    }

    return corsResponse({
      success: false,
      message: "Invalid Method",
    }, 400);
    
  } catch (error: any) {
    console.error("API Error:", error);
    return corsResponse({
      success: false,
      error: error?.message ?? "Unknown error",
    }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

// ✅ ADDITIONAL LOADER FOR GET REQUESTS (NON-OPTIONS)
export async function loaderGET({ request }: LoaderFunctionArgs) {
  try {
    const settings = await prisma.referralSettings.findFirst();

    return corsResponse({
      success: true,
      data: {
        referralRewards: (settings?.referralRewards as ReferralReward[]) || [],
        settings: settings
      },
    });
  } catch (error) {
    return corsResponse({
      success: true,
      data: { referralRewards: [], settings: null },
    });
  }
}
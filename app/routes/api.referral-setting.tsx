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

// =============================
// GET - Load referral settings
// =============================
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const settings = await prisma.referralSettings.findFirst();

    return Response.json({
      success: true,
      data: {
        referralRewards: (settings?.referralRewards as ReferralReward[]) || [],
      },
    });
  } catch (error) {
    return Response.json({
      success: true,
      data: { referralRewards: [] },
    });
  }
}

// =============================
// POST - Create / Update / Delete
// =============================
export async function action({ request }: ActionFunctionArgs) {
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

      return Response.json({
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

      return Response.json({
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

      return Response.json({
        success: true,
        message: "Deleted Successfully",
      });
    }

    return Response.json({
      success: false,
      message: "Invalid Method",
    });
  } catch (error: any) {
    console.error("API Error:", error);
    return Response.json({
      success: false,
      error: error?.message ?? "Unknown error",
    });
  }
}
import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../shopify.server";

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
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const settings = await prisma.referralSettings.findFirst({
      where: { shop },
    });

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

    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // CREATE
    if (method === "create") {
      const created = await prisma.referralSettings.create({
        data: {
          shop,
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
      const existingSettings = await prisma.referralSettings.findFirst({
        where: { shop },
      });

      let result;

      if (existingSettings) {
        // update existing
        result = await prisma.referralSettings.update({
          where: { shop },
          data: {
            referralRewards: referralRewards || [],
            updatedAt: new Date(),
          },
        });
      } else {
        // create new if not exist
        result = await prisma.referralSettings.create({
          data: {
            shop,
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
      await prisma.referralSettings.delete({
        where: { shop },
      });

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

import { PrismaClient } from '@prisma/client';
import { authenticate } from "../shopify.server";

const prisma = new PrismaClient();

// =============================
// GET - Load referral settings
// =============================
export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const settings = await prisma.referralSettings.findFirst({
      where: { shop }
    });

    return Response.json({
      success: true,
      data: {
        referralRewards: settings?.referralRewards || []
      }
    });

  } catch (error) {
    return Response.json({
      success: true,
      data: { referralRewards: [] }
    });
  }
}

// =============================
// POST - Create / Update / Delete
// =============================
// =============================
// POST - Create / Update / Delete
// =============================
export async function action({ request }) {
  try {
    const body = await request.json();
    const { referralRewards, method } = body;

    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // ======================================
    // CREATE
    // ======================================
    if (method === "create") {
      const createData = await prisma.referralSettings.create({
        data: {
          shop,
          referralRewards
        }
      });

      return Response.json({
        success: true,
        message: "Created Successfully",
        data: createData
      });
    }

    // ======================================
    // UPDATE - FIXED VERSION
    // ======================================
    if (method === "update") {
      // Pehle check karo record exist karta hai ya nahi
      const existingSettings = await prisma.referralSettings.findFirst({
        where: { shop }
      });

      let result;
      
      if (existingSettings) {
        // Update existing record
        result = await prisma.referralSettings.update({
          where: { shop },
          data: {
            referralRewards,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new record
        result = await prisma.referralSettings.create({
          data: {
            shop,
            referralRewards
          }
        });
      }

      return Response.json({
        success: true,
        message: existingSettings ? "Updated Successfully" : "Created Successfully",
        data: result
      });
    }

    // ======================================
    // DELETE
    // ======================================
    if (method === "delete") {
      await prisma.referralSettings.delete({
        where: { shop }
      });

      return Response.json({
        success: true,
        message: "Deleted Successfully"
      });
    }

    return Response.json({
      success: false,
      message: "Invalid Method"
    });

  } catch (error) {
    console.error('API Error:', error);
    return Response.json({
      success: false,
      error: error.message
    });
  }
}
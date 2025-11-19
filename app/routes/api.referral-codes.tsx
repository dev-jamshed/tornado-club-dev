import { json, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
 
    const referralCodes = await prisma.referralCode.findMany({
      orderBy: { createdAt: 'desc' }
    });


    
    return json({ 
      success: true, 
      referralCodes 
    });
 
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { 
      customerId, 
      customerEmail, 
      customerName, 
      referralCode, 
      referralLink
    } = body;

    // Check if referral code already exists for this customer
    const existingCode = await prisma.referralCode.findFirst({
      where: {
        OR: [
          { customerId },
          { referralCode }
        ]
      }
    });

    if (existingCode) {
      return json({ 
        success: false, 
        error: "Referral code already exists for this customer" 
      }, { status: 400 });
    }

    // Create new referral code
    const referral = await prisma.referralCode.create({
      data: {
        customerId,
        customerName,
        customerEmail,
        referralCode,
        referralLink,
        referralCount: 0
      }
    });

    return json({ 
      success: true, 
      referral 
    }, { status: 201 });
    
  } catch (error) {
    console.error("Error creating referral code:", error);
    return json({ 
      success: false, 
      error: "Failed to create referral code" 
    }, { status: 500 });
  }
}
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const { customerId, customerEmail, referralCode } = await request.json();
    
    if (!referralCode) {
      return new Response(
        JSON.stringify({
          success: false,
          isValid: false,
          reason: "No referral code provided"
        })
      );
    }

    // 1. Check if referral code format is valid (TC- format)
    const isValidFormat = referralCode.startsWith('TC-') && referralCode.length > 3;
    
    if (!isValidFormat) {
      return new Response(
        JSON.stringify({
          success: true,
          isValid: false,
          reason: "Invalid referral code format"
        })
      );
    }

    // 2. Check if this referral code exists in any customer's metafields
    const query = `
      query {
        customers(query: "metafields.custom.referral_code:${referralCode}", first: 1) {
          edges {
            node {
              id
              email
              displayName
              referralCode: metafield(namespace: "custom", key: "referral_code") {
                value
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    const customerWithThisCode = data.data.customers.edges[0]?.node;

    if (!customerWithThisCode) {
      return new Response(
        JSON.stringify({
          success: true,
          isValid: false,
          reason: "Referral code does not exist"
        })
      );
    }

    // 3. Valid referral code found
    return new Response(
      JSON.stringify({
        success: true,
        isValid: true,
        reason: "Valid referral code",
        referrerCustomer: {
          id: customerWithThisCode.id,
          name: customerWithThisCode.displayName,
          email: customerWithThisCode.email
        },
        referralCode: referralCode
      })
    );

  } catch (error) {
    console.error('Referral verification error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500 }
    );
  }
}
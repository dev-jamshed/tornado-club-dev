// FILE: app/routes/api.customers.jsx

import { authenticate } from "../shopify.server";

// ==============================
// GET CUSTOMER LIST + METAFIELDS
// ==============================
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    // GraphQL query to fetch customers + metafields
    const query = `
      query {
        customers(first: 100) {
          edges {
            node {
              id
              firstName
              lastName
              email

              referralCode: metafield(namespace: "custom", key: "referral_code") {
                value
              }

              referralsCount: metafield(namespace: "custom", key: "referrals_count") {
                value
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const json = await response.json();

    const customers = json.data.customers.edges.map(({ node }) => ({
      id: node.id,
      name: `${node.firstName || ""} ${node.lastName || ""}`.trim(),
      email: node.email,
      referralCode: node.referralCode?.value || null,
      referralsCount: node.referralsCount?.value
        ? Number(node.referralsCount.value)
        : 0
    }));

    return Response.json({
      success: true,
      customers
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    });
  }
}

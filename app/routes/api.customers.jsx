import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  
  try {
    // Minimal fields - sirf view ke liye
    const response = await admin.graphql(`
      query {
        customers(first: 100) {
          edges {
            node {
              id
              firstName
              email
            }
          }
        }
      }
    `);
    
    const data = await response.json();
    
    // Check for access denied error
    if (data.errors && data.errors.length > 0) {
      const accessError = data.errors.find(error => 
        error.message.includes('access denied') || 
        error.message.includes('permission')
      );
      
      if (accessError) {
        return json({ 
          success: false, 
          error: "Customer access denied. Please update app permissions to include 'read_customers' scope in shopify.app.toml" 
        });
      }
    }
    
    if (data.data && data.data.customers) {
      // Real customer data
      const customers = data.data.customers.edges.map(edge => ({
        id: edge.node.id,
        name: edge.node.firstName || 'Unknown Customer',
        email: edge.node.email,
        ordersCount: 0, // Default value since we don't have numberOfOrders permission
        phone: 'N/A'
      }));
      
      return json({ 
        success: true, 
        customers, 
        source: "real",
        count: customers.length
      });
    } else {
      return json({ 
        success: false, 
        error: "No customer data received from Shopify" 
      });
    }
    
  } catch (error) {
    return json({ 
      success: false, 
      error: `Failed to fetch customers: ${error.message}. Please check app permissions.` 
    });
  }
}
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    console.log('🛍️ Real Shopify products fetch shuru...');
    
    // Direct authenticate use karo
    const { session } = await authenticate.admin(request);
    
    console.log('✅ Session mil gayi:', session.shop);
    
    // Session se directly GraphQL call karo - Stock status ke saath
    const response = await fetch(`https://${session.shop}/admin/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': session.accessToken,
      },
      body: JSON.stringify({
        query: `
          query GetProducts {
            products(first: 50, query: "status:active") {
              edges {
                node {
                  id
                  title
                  featuredImage {
                    url
                  }
                  status
                  variants(first: 10) {
                    edges {
                      node {
                        price
                        inventoryQuantity
                        inventoryPolicy
                        availableForSale
                      }
                    }
                  }
                }
              }
            }
          }
        `
      })
    });

    const productsData = await response.json();
    
    if (productsData.errors) {
      throw new Error(productsData.errors[0].message);
    }

    // ✅ Sirf ACTIVE aur stock available products filter karo
    const availableProducts = productsData.data.products.edges
      .map(edge => {
        const product = edge.node;
        const firstVariant = product.variants.edges[0]?.node;
        
        // ✅ Check product availability - ACTIVE status aur available for sale
        const isAvailable = product.status === 'ACTIVE' && 
                           firstVariant?.availableForSale === true;
        
        return {
          label: product.title,
          value: product.id,
          image: product.featuredImage?.url,
          price: firstVariant?.price || "0.00",
          available: isAvailable,
          status: product.status,
          inventoryQuantity: firstVariant?.inventoryQuantity,
          availableForSale: firstVariant?.availableForSale
        };
      })
      .filter(product => product.available); // ✅ Sirf available products

    console.log('✅ Available products mil gaye:', availableProducts.length);
    
    return Response.json({
      success: true,
      data: availableProducts,
      total: availableProducts.length
    });
    
  } catch (error) {
    console.error('❌ Real products fetch error:', error);
    
    return Response.json({
      success: false,
      error: "Real products fetch failed: " + error.message
    }, { status: 500 });
  }
}
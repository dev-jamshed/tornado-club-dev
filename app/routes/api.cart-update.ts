import { ActionFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    try {
      const { cart, attributes } = await request.json();
      
      // Check if free products attribute exists
      const freeProductsAttr = attributes.find((attr: { key: string; }) => attr.key === 'free_products');
      
      if (freeProductsAttr) {
        const freeProducts = JSON.parse(freeProductsAttr.value);
        
        // Update cart lines - free products ko $0 karen
        const updatedLines = cart.lines.map((line: { merchandise: { product: { id: any; }; }; cost: { totalAmount: { currencyCode: any; }; }; }) => {
          const productId = line.merchandise.product.id;
          
          if (freeProducts.includes(productId)) {
            return {
              ...line,
              cost: {
                ...line.cost,
                totalAmount: {
                  amount: "0.00",
                  currencyCode: line.cost.totalAmount.currencyCode
                }
              }
            };
          }
          return line;
        });
        
        return new Response(JSON.stringify({
          success: true,
          cart: {
            ...cart,
            lines: updatedLines
          }
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          }
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        cart: cart
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
      
    } catch (error) {
      console.error("Cart update error:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "Cart update failed"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }
  }
  
  return new Response(null, { status: 405 });
}
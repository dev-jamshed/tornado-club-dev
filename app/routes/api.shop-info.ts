import { LoaderFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin, session } = await authenticate.admin(request);

    if (!session) {
      return json(
        { ok: false, message: "Session missing — open app from Shopify admin" },
        { status: 401 }
      );
    }

    return json({
      ok: true,
      shop: session.shop,
      isOnline: session?.isOnline ?? false,
    });

  } catch (error: any) {
    return json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

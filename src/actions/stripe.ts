"use server";

import { currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
  typescript: true,
});

export async function createStripeSession(prevState, formData: FormData) {
  const priceId = formData.get("priceId") as string;
  const user = await currentUser();
  if (!user) {
    throw new Error("認証が必要です");
  }
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          // Provide the exact Price ID (for example, price_1234) of the product you want to sell
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.BASE_URL}/dashboard/?success=true`,
      cancel_url: `${process.env.BASE_URL}/dashboard/?canceled=true`,
    });
    console.log("session", session);

    if (!session.url) {
      throw new Error("セッションの作成に失敗しました");
    }

    return {
      status: "success",
      error: "",
      redirectUrl: session.url,
    };
  } catch (error) {
    console.error("Stripe session creation error:", error);
    return {
      status: "error",
      error: "決済処理中にエラーが発生しました",
      redirectUrl: "",
    };
  }
}

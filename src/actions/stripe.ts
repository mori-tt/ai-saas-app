"use server";

import { stripe } from "@/config/stripe";
import { prisma } from "@/lib/prisma";
import { StripeState } from "@/types/actions";
import { currentUser } from "@clerk/nextjs/server";

// ユーザーがDBに存在しない場合に作成する関数
async function ensureUserExists(clerkId: string, email: string) {
  try {
    // まずClerkIDでユーザーを検索
    let dbUser = await prisma.user.findUnique({
      where: { clerkId },
    });

    // ClerkIDで見つからない場合、メールアドレスで検索
    if (!dbUser) {
      console.log(`ClerkIDでユーザーが見つかりません: ${clerkId}`);
      try {
        // メールアドレスでの検索を試みる
        const userByEmail = await prisma.user.findUnique({
          where: { email },
        });

        if (userByEmail) {
          // メールアドレスでユーザーが見つかった場合、ClerkIDを更新
          console.log(
            `メールアドレスでユーザーが見つかりました: Email=${email}、ClerkIDを更新します`
          );
          dbUser = await prisma.user.update({
            where: { id: userByEmail.id },
            data: { clerkId },
          });
          console.log(`ユーザーのClerkIDを更新しました: UserID=${dbUser.id}`);
          return dbUser;
        }

        // 本当に新規ユーザーの場合のみ作成
        console.log(
          `ユーザーが存在しません。新規作成します: ClerkID=${clerkId}, Email=${email}`
        );
        dbUser = await prisma.user.create({
          data: {
            clerkId,
            email,
            credits: 5,
            subscriptionStatus: "FREE",
          },
        });
        console.log(`ユーザーを作成しました: UserID=${dbUser.id}`);
      } catch (innerError) {
        if (
          innerError instanceof Error &&
          innerError.message.includes("Unique constraint failed")
        ) {
          console.error(
            `同時実行によるユニーク制約エラー: ${innerError.message}`
          );
          // 競合が発生した場合は少し待ってから再検索
          await new Promise((resolve) => setTimeout(resolve, 500));
          dbUser = await prisma.user.findFirst({
            where: {
              OR: [{ clerkId }, { email }],
            },
          });
          if (!dbUser) {
            throw new Error("ユーザー検索に失敗しました");
          }
        } else {
          throw innerError;
        }
      }
    } else {
      console.log(
        `既存ユーザーが見つかりました: UserID=${dbUser.id}, ClerkID=${clerkId}`
      );
    }

    return dbUser;
  } catch (error) {
    console.error(
      `ユーザー保証処理でエラーが発生しました: ClerkID=${clerkId}`,
      error
    );
    throw error;
  }
}

export async function createStripeSession(
  prevState: StripeState,
  formData: FormData
): Promise<StripeState> {
  const priceId = formData.get("priceId") as string;
  const user = await currentUser();
  if (!user) {
    throw new Error("認証が必要です");
  }

  try {
    // メールアドレスを取得
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      throw new Error("メールアドレスが見つかりません");
    }

    // ユーザーが存在することを保証
    const dbUser = await ensureUserExists(user.id, email);

    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      console.log(
        `Stripeカスタマーを作成します: ClerkID=${user.id}, Email=${email}`
      );
      const customer = await stripe.customers.create({
        email: email,
        metadata: { userId: user.id, clerkId: user.id },
      });

      await prisma.user.update({
        where: { clerkId: user.id },
        data: { stripeCustomerId: customer.id },
      });

      customerId = customer.id;
      console.log(`Stripeカスタマー作成完了: CustomerID=${customer.id}`);
    }

    // 既存のアクティブなサブスクリプションを確認
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    // 既存のアクティブなサブスクリプションIDを取得
    const existingSubscriptionIds = existingSubscriptions.data
      .map((sub) => sub.id)
      .join(",");

    console.log(
      `チェックアウトセッションを作成します: CustomerID=${customerId}, PriceId=${priceId}`
    );

    if (existingSubscriptionIds) {
      console.log(
        `既存のアクティブなサブスクリプションが見つかりました: ${existingSubscriptionIds}`
      );
    }

    // メタデータを準備
    const metadata: Record<string, string> = {
      clerkId: user.id,
      userId: dbUser.id,
    };

    // 既存サブスクリプションがあればメタデータに追加
    if (existingSubscriptionIds) {
      metadata.previous_subscription_ids = existingSubscriptionIds;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          // Provide the exact Price ID (for example, price_1234) of the product you want to sell
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      success_url: `${process.env.BASE_URL}/dashboard?success=true&session_preserved=true`,
      cancel_url: `${process.env.BASE_URL}/dashboard?canceled=true&session_preserved=true`,
      metadata,
    });
    console.log(`セッション作成完了: SessionID=${session.id}`);

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

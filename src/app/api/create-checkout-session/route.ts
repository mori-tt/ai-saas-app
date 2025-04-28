import { SubscriptionService } from "@/services/subscription-service";
import { UserService } from "@/services/user-service";
import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Stripeチェックアウトセッション作成API
 * 新規サブスクリプション購入フローのURLを生成
 */
export async function POST(request: NextRequest) {
  try {
    // リクエストボディからプランIDを取得
    const { priceId } = await request.json();

    if (!priceId) {
      console.error(
        "チェックアウトセッション作成: プランIDが指定されていません"
      );
      return NextResponse.json(
        { error: "プランIDが指定されていません" },
        { status: 400 }
      );
    }

    // 認証済みユーザーの取得
    const user = await currentUser();
    if (!user) {
      console.error("チェックアウトセッション作成: 未認証ユーザー");
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      console.error(
        "チェックアウトセッション作成: メールアドレスが見つかりません"
      );
      return NextResponse.json(
        { error: "メールアドレスが見つかりません" },
        { status: 400 }
      );
    }

    console.log(
      `チェックアウトセッション作成: ClerkID=${user.id}, Email=${email}`
    );

    // ユーザーが存在しない場合は作成
    const dbUser = await UserService.ensureUserExists(user.id, email);
    if (!dbUser) {
      console.error(
        `チェックアウトセッション作成: ユーザー取得失敗 ClerkID=${user.id}`
      );
      return NextResponse.json(
        { error: "ユーザー情報の取得に失敗しました" },
        { status: 500 }
      );
    }

    console.log(
      `チェックアウトセッション作成: ユーザー確認済み UserID=${dbUser.id}`
    );

    // チェックアウトセッション作成
    try {
      const url = await SubscriptionService.createCheckoutSession(
        priceId,
        dbUser.id,
        dbUser.email,
        dbUser.stripeCustomerId
      );
      return NextResponse.json({ url });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      console.error(
        `チェックアウトセッション作成エラー: ${errorMessage}`,
        error
      );
      return NextResponse.json(
        { error: "チェックアウトセッションの作成に失敗しました" },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "不明なエラーが発生しました";

    console.error("チェックアウトセッション作成エラー:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

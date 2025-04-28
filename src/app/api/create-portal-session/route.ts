import { SubscriptionService } from "@/services/subscription-service";
import { UserService } from "@/services/user-service";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Stripeカスタマーポータルセッション作成API
 * サブスクリプション管理画面への遷移URLを生成
 */
export async function POST() {
  try {
    // 認証済みユーザーの取得
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // データベースからユーザー情報を取得
    const dbUser = await UserService.findUserByClerkId(user.id);
    if (!dbUser) {
      return NextResponse.json(
        { error: "ユーザー情報が見つかりません" },
        { status: 404 }
      );
    }

    // StripeカスタマーIDがない場合はエラー
    if (!dbUser.stripeCustomerId) {
      return NextResponse.json(
        { error: "サブスクリプション情報が見つかりません" },
        { status: 400 }
      );
    }

    // Stripeポータルセッション作成
    try {
      const url = await SubscriptionService.createPortalSession(
        dbUser.stripeCustomerId
      );
      return NextResponse.json({ url });
    } catch (error) {
      console.error("ポータルセッション作成エラー:", error);
      return NextResponse.json(
        { error: "ポータルセッションの作成に失敗しました" },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "不明なエラーが発生しました";

    console.error("ポータルセッション作成エラー:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { UserService } from "@/services/user-service";

/**
 * ダッシュボードのキャッシュを更新するAPI
 * ユーザー情報を再取得し、表示を更新します
 */
export async function POST() {
  try {
    // 認証ユーザーの取得処理に時間をかける
    let user;
    for (let i = 0; i < 5; i++) {
      user = await currentUser();
      if (user) break;

      // 認証が取得できない場合は少し待ってから再試行
      console.log(`認証ユーザー取得試行中... (${i + 1}/5)`);
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }

    if (!user) {
      console.log("リフレッシュキャッシュAPI: 認証ユーザーが見つかりません");
      return NextResponse.json(
        { error: "認証が必要です", authenticated: false, retryAfter: 2000 },
        { status: 401 }
      );
    }

    console.log(`リフレッシュキャッシュAPI: 認証済みユーザー ID=${user.id}`);

    // ユーザー情報を再取得（リトライ処理付き）
    let dbUser;
    for (let i = 0; i < 5; i++) {
      try {
        dbUser = await prisma.user.findUnique({
          where: { clerkId: user.id },
          select: {
            id: true,
            credits: true,
            subscriptionStatus: true,
          },
        });

        if (dbUser) break;

        console.log(`DB検索リトライ中... (${i + 1}/5)`);
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      } catch (err) {
        console.error(`DB検索エラー (${i + 1}/5):`, err);
        if (i < 4)
          await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }

    // ユーザーが見つからない場合は自動作成を試みる
    if (!dbUser) {
      try {
        console.log(
          `ユーザーが見つからないため新規作成を試みます: ClerkID=${user.id}`
        );
        const email = user.emailAddresses.find(
          (e) => e.emailAddress
        )?.emailAddress;

        if (!email) {
          console.error("メールアドレスが見つかりません");
          return NextResponse.json(
            { error: "メールアドレスが必要です", authenticated: true },
            { status: 400 }
          );
        }

        // UserServiceを使ってユーザーを作成（リトライ込み）
        try {
          // 作成前に少し待機（他の処理との競合を避ける）
          await new Promise((resolve) => setTimeout(resolve, 500));

          const createdUser = await UserService.ensureUserExists(
            user.id,
            email
          );
          console.log(
            `ユーザーを作成しました: ID=${createdUser.id}, Email=${email}`
          );

          // 作成したユーザー情報をセット
          dbUser = {
            id: createdUser.id,
            credits: createdUser.credits,
            subscriptionStatus: createdUser.subscriptionStatus,
          };
        } catch (userCreateError) {
          console.error("ユーザー作成中にエラー発生:", userCreateError);

          // エラー後に再度検索を試みる（別プロセスで作成された可能性）
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const retryUser = await prisma.user.findUnique({
            where: { clerkId: user.id },
            select: {
              id: true,
              credits: true,
              subscriptionStatus: true,
            },
          });

          if (retryUser) {
            console.log("ユーザー作成エラー後の再検索で見つかりました");
            dbUser = retryUser;
          } else {
            throw userCreateError; // 本当に失敗した場合は例外を投げる
          }
        }
      } catch (createError) {
        console.error("ユーザー作成中にエラーが発生しました:", createError);
        return NextResponse.json(
          {
            error: "ユーザーの作成に失敗しました",
            authenticated: true,
            userFound: false,
            clerkId: user.id,
          },
          { status: 500 }
        );
      }
    }

    // この時点でもdbUserがnullの場合はエラーを返す
    if (!dbUser) {
      console.log(
        `リフレッシュキャッシュAPI: DBにユーザーが見つからず、作成も失敗しました ClerkID=${user.id}`
      );
      return NextResponse.json(
        {
          error: "ユーザーが見つかりません",
          authenticated: true,
          userFound: false,
          clerkId: user.id,
        },
        { status: 404 }
      );
    }

    // ダッシュボード関連のパスのキャッシュを無効化
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/plan");
    revalidatePath("/dashboard/tools");

    console.log(
      `キャッシュ更新: ユーザー${dbUser.id}の情報を再取得しました (Credits: ${dbUser.credits}, Plan: ${dbUser.subscriptionStatus})`
    );

    return NextResponse.json({
      success: true,
      refreshed: true,
      credits: dbUser.credits || 0,
      plan: dbUser.subscriptionStatus || "FREE",
      userId: dbUser.id,
    });
  } catch (error) {
    console.error("キャッシュ更新エラー:", error);
    return NextResponse.json(
      { error: "キャッシュの更新に失敗しました" },
      { status: 500 }
    );
  }
}

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

export async function getUserCredits() {
  try {
    // リトライカウンター
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      const user = await currentUser();
      if (!user) {
        console.log(
          `ユーザークレジット取得: 認証ユーザーが見つかりません (試行: ${
            retries + 1
          }/${maxRetries})`
        );
        // 少し待ってから再試行
        if (retries < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          retries++;
          continue;
        }
        return null;
      }

      console.log(`ユーザークレジット取得: ClerkID=${user.id}の情報を検索中`);

      // データベースからユーザー情報を取得
      const dbUser = await prisma.user.findUnique({
        where: {
          clerkId: user.id,
        },
        select: {
          id: true,
          credits: true,
          subscriptionStatus: true,
        },
      });

      if (!dbUser) {
        console.log(
          `ユーザークレジット取得: ClerkID=${
            user.id
          }のユーザーが見つかりません (試行: ${retries + 1}/${maxRetries})`
        );
        // 少し待ってから再試行
        if (retries < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          retries++;
          continue;
        }
        return 0;
      }

      console.log(
        `ユーザークレジット取得成功: UserID=${dbUser.id}, Credits=${dbUser.credits}, Plan=${dbUser.subscriptionStatus}`
      );

      // 明示的に数値に変換して返す
      const credits = typeof dbUser.credits === "number" ? dbUser.credits : 0;
      return credits;
    }

    return 0; // 全てのリトライが失敗した場合
  } catch (error) {
    console.error("ユーザークレジット取得エラー:", error);
    return 0;
  }
}

export async function decrementUserCredits(clerkId: string) {
  try {
    console.log(`クレジット減算: ClerkID=${clerkId}のクレジットを1減らします`);

    const user = await prisma.user.update({
      where: {
        clerkId: clerkId,
      },
      data: {
        credits: {
          decrement: 1,
        },
      },
      select: {
        id: true,
        credits: true,
      },
    });

    console.log(
      `クレジット減算成功: UserID=${user.id}, 残りCredits=${user.credits}`
    );

    // ダッシュボードのキャッシュを無効化する処理は削除（APIルートで行う）

    return user?.credits ?? 0;
  } catch (error) {
    console.error(`クレジット減算エラー: ClerkID=${clerkId}`, error);
    throw new Error("クレジットの更新に失敗しました");
  }
}

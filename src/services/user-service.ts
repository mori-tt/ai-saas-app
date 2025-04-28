import { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * ユーザー関連の処理を一元管理するサービスクラス
 */
export class UserService {
  /**
   * ユーザーの存在確認と作成
   */
  static async ensureUserExists(clerkId: string, email: string): Promise<User> {
    try {
      // ClerkIDでユーザーを検索
      let user = await prisma.user.findUnique({
        where: { clerkId },
      });

      if (user) {
        return user;
      }

      // メールアドレスで検索
      const userByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (userByEmail) {
        // ClerkIDの更新
        user = await prisma.user.update({
          where: { id: userByEmail.id },
          data: { clerkId },
        });
        return user;
      }

      // 新規ユーザーの作成
      user = await prisma.user.create({
        data: {
          clerkId,
          email,
          credits: 5,
          subscriptionStatus: "FREE",
        },
      });

      return user;
    } catch (error) {
      // ユニーク制約エラーの処理
      if (
        error instanceof Error &&
        error.message.includes("Unique constraint failed")
      ) {
        // 競合が発生した場合は再検索
        await new Promise((resolve) => setTimeout(resolve, 300));
        const foundUser = await prisma.user.findFirst({
          where: {
            OR: [{ clerkId }, { email }],
          },
        });

        if (foundUser) {
          return foundUser;
        }
      }

      throw error;
    }
  }

  /**
   * ユーザークレジットの減算
   */
  static async decrementCredits(
    clerkId: string,
    amount: number = 1
  ): Promise<number> {
    const user = await prisma.user.update({
      where: { clerkId },
      data: {
        credits: {
          decrement: amount,
        },
      },
      select: {
        id: true,
        credits: true,
      },
    });

    return user.credits;
  }

  /**
   * ユーザーの検索 (リトライ機能付き)
   */
  static async findUserByClerkId(
    clerkId: string,
    retries: number = 3
  ): Promise<User | null> {
    for (let i = 0; i < retries; i++) {
      try {
        const user = await prisma.user.findUnique({
          where: { clerkId },
        });

        if (user) {
          return user;
        }

        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch {
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    return null;
  }
}

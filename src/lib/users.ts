import { prisma } from "./prisma";

/**
 * Clerkからのwebhookで呼び出されるユーザー作成関数
 */
export async function createUser(clerkId: string, email: string) {
  try {
    // ユーザーが既に存在する場合は作成しない
    const existingUser = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (existingUser) {
      console.log(`ユーザーは既に存在します: ClerkID=${clerkId}`);
      return existingUser;
    }

    // 新規ユーザー作成
    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
        credits: 5,
        subscriptionStatus: "FREE",
      },
    });
    console.log(`ユーザー作成成功: ID=${user.id}, Email=${email}`);
    return user;
  } catch (error) {
    console.error(`ユーザー作成エラー: ClerkID=${clerkId}`, error);
    throw error;
  }
}

/**
 * ユーザー情報更新関数
 */
export async function updateUser(clerkId: string, email: string) {
  try {
    const user = await prisma.user.update({
      where: { clerkId },
      data: { email },
    });
    console.log(`ユーザー更新成功: ID=${user.id}, Email=${email}`);
    return user;
  } catch (error) {
    console.error(`ユーザー更新エラー: ClerkID=${clerkId}`, error);
    throw error;
  }
}

/**
 * ユーザー削除関数
 */
export async function deleteUser(clerkId: string) {
  try {
    const user = await prisma.user.delete({
      where: { clerkId },
    });
    console.log(`ユーザー削除成功: ID=${user.id}`);
    return user;
  } catch (error) {
    console.error(`ユーザー削除エラー: ClerkID=${clerkId}`, error);
    throw error;
  }
}

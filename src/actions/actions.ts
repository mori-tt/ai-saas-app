"use server";

import { GenerateImageState, RemoveBackgroundState } from "@/types/actions";

export async function generateImage(
  state: GenerateImageState,
  formData: FormData
): Promise<GenerateImageState> {
  const keyword = formData.get("keyword");

  if (!keyword || typeof keyword !== "string") {
    return {
      status: "error",
      error: "キーワードを入力",
    };
  }
  try {
    const response = await fetch(`${process.env.BASE_URL}/api/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keyword }),
    });

    const data = await response.json();

    console.log(data.imageUrl);

    return { status: "success", imageUrl: data.imageUrl, keyword: keyword };
  } catch (error) {
    console.error(error);
    return {
      status: "error",
      error: "画像の生成に失敗しました",
    };
  }
}

export async function removeBackground(
  state: RemoveBackgroundState,
  formData: FormData
): Promise<RemoveBackgroundState> {
  const image = formData.get("image") as File;

  if (!image) {
    return {
      status: "error",
      error: "画像ファイルを選択してください",
    };
  }

  try {
    const response = await fetch(
      `${process.env.BASE_URL}/api/remove-background`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    console.log(data.imageUrl);

    return { status: "success", processedImage: data.imageUrl };
  } catch (error) {
    console.error(error);
    return {
      status: "error",
      error: "背景の削除に失敗しました",
    };
  }
}

"use server";

import { GenerateImageState } from "@/types/actions";

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

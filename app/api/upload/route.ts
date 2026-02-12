import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl } = await request.json();

    if (!imageDataUrl) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    const base64 = imageDataUrl.split(",")[1];
    if (!base64) {
      return NextResponse.json({ error: "Invalid image data URL" }, { status: 400 });
    }

    // Try Imgur first (anonymous upload, no auth needed)
    const imgurUrl = await uploadToImgur(base64);
    if (imgurUrl) {
      return NextResponse.json({ url: imgurUrl });
    }

    // Fallback: nostr.build legacy form upload
    const nostrBuildUrl = await uploadToNostrBuildLegacy(base64);
    if (nostrBuildUrl) {
      return NextResponse.json({ url: nostrBuildUrl });
    }

    return NextResponse.json({ error: "All upload services failed" }, { status: 500 });

  } catch (error) {
    console.error("Upload proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

async function uploadToImgur(base64: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("image", base64);
    formData.append("type", "base64");

    const response = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: "Client-ID 546c25a59c58ad7",
      },
      body: formData,
    });

    if (!response.ok) {
      console.error("Imgur upload failed:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();

    if (result.success && result.data?.link) {
      console.log("Uploaded to Imgur:", result.data.link);
      return result.data.link;
    }

    return null;
  } catch (error) {
    console.error("Imgur error:", error);
    return null;
  }
}

async function uploadToNostrBuildLegacy(base64: string): Promise<string | null> {
  try {
    const imageBuffer = Buffer.from(base64, "base64");
    const blob = new Blob([imageBuffer], { type: "image/png" });

    const formData = new FormData();
    formData.append("fileToUpload", blob, "nostrdraw-canvas.png");
    formData.append("submit", "Upload Image");

    const response = await fetch("https://nostr.build/upload.php", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      console.error("nostr.build legacy failed:", response.status);
      return null;
    }

    const text = await response.text();
    const urlMatch = text.match(/https:\/\/nostr\.build\/i\/[^\s"'<>]+/);
    if (urlMatch) {
      console.log("Uploaded to nostr.build:", urlMatch[0]);
      return urlMatch[0];
    }

    return null;
  } catch (error) {
    console.error("nostr.build legacy error:", error);
    return null;
  }
}
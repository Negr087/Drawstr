/**
 * Upload image via the local API proxy (avoids CORS restrictions)
 * The proxy at /api/upload handles the actual upload to nostr.build server-side
 */
export async function uploadToNostrBuild(
  imageDataUrl: string
): Promise<string | null> {
  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageDataUrl }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Proxy upload failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.url) {
      return result.url;
    }

    throw new Error("No URL in response");
  } catch (error) {
    console.error("Failed to upload to nostr.build:", error);
    return null;
  }
}

/**
 * Upload with fallback - uses server-side proxy to avoid CORS
 */
export async function uploadImageWithFallback(
  imageDataUrl: string,
  onProgress?: (status: string) => void
): Promise<string | null> {
  onProgress?.("Uploading image...");

  const url = await uploadToNostrBuild(imageDataUrl);

  if (url) {
    onProgress?.("Upload successful!");
    return url;
  }

  onProgress?.("Upload failed");
  return null;
}
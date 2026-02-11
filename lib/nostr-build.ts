/**
 * Upload image to nostr.build
 * Returns the URL of the uploaded image
 */
export async function uploadToNostrBuild(
  imageDataUrl: string
): Promise<string | null> {
  try {
    // Convert data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();

    // Create form data
    const formData = new FormData();
    formData.append("fileToUpload", blob, "nostrdraw-canvas.png");
    formData.append("submit", "Upload Image");

    // Upload to nostr.build
    const uploadResponse = await fetch("https://nostr.build/api/v2/upload/files", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.json();
    
    // nostr.build returns data in format: { status: "success", data: [{ url: "..." }] }
    if (result.status === "success" && result.data && result.data.length > 0) {
      return result.data[0].url;
    }

    throw new Error("Invalid response from nostr.build");
  } catch (error) {
    console.error("Failed to upload to nostr.build:", error);
    return null;
  }
}

/**
 * Alternative: Upload to void.cat (another popular Nostr image host)
 */
export async function uploadToVoidCat(
  imageDataUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();

    const uploadResponse = await fetch("https://void.cat/upload", {
      method: "POST",
      headers: {
        "V-Content-Type": "image/png",
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.json();
    
    // void.cat returns: { ok: true, file: { id: "...", url: "..." } }
    if (result.ok && result.file) {
      return result.file.url;
    }

    throw new Error("Invalid response from void.cat");
  } catch (error) {
    console.error("Failed to upload to void.cat:", error);
    return null;
  }
}

/**
 * Upload with fallback: tries nostr.build first, then void.cat
 */
export async function uploadImageWithFallback(
  imageDataUrl: string,
  onProgress?: (status: string) => void
): Promise<string | null> {
  // Try nostr.build first
  onProgress?.("Uploading to nostr.build...");
  let url = await uploadToNostrBuild(imageDataUrl);
  
  if (url) {
    onProgress?.("Upload successful!");
    return url;
  }

  // Fallback to void.cat
  onProgress?.("Trying alternative host...");
  url = await uploadToVoidCat(imageDataUrl);
  
  if (url) {
    onProgress?.("Upload successful!");
    return url;
  }

  onProgress?.("Upload failed");
  return null;
}
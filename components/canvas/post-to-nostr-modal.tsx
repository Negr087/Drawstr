"use client";

import { useState, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { uploadImageWithFallback } from "@/lib/nostr-build";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, Check, AlertCircle, Image as ImageIcon, Upload } from "lucide-react";

interface PostToNostrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostToNostrModal({ open, onOpenChange }: PostToNostrModalProps) {
  const [content, setContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [includeImage, setIncludeImage] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  const { canvasName, elements, canvasId } = useCanvasStore();
  const { publishNote, user } = useNostr();

  // Generate canvas screenshot
  const generateScreenshot = () => {
    try {
      // Try to find the canvas element
      const canvas = document.getElementById("drawstr-canvas") as HTMLCanvasElement;

      if (!canvas) {
        console.error("Canvas element not found in DOM");
        return null;
      }

      // Check if canvas has content
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Could not get canvas 2D context");
        return null;
      }

      // Generate the data URL
      const dataUrl = canvas.toDataURL("image/png");
      console.log("Screenshot data URL length:", dataUrl.length);

      return dataUrl;
    } catch (error) {
      console.error("Error generating screenshot:", error);
      return null;
    }
  };

  // Generate screenshot when modal opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure render
      setTimeout(() => {
        const screenshot = generateScreenshot();
        console.log("Screenshot generated:", screenshot ? "success" : "failed");
        setImageData(screenshot);
        setContent(`Check out my drawing on NostrDraw! 🎨\n\n${window.location.origin}/canvas/${canvasId}`);
        setIncludeImage(true);
        setPosted(false);
        setError(null);
        setUploadStatus("");
      }, 100);
    } else {
      setContent("");
      setImageData(null);
      setUploadStatus("");
    }
  }, [open, canvasId]);

  // Handle modal open
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const handlePost = async () => {
    if (!user) return;

    // Image is required, but text is optional
    if (!imageData) {
      setError("No canvas to share. Please draw something first!");
      return;
    }

    setIsPosting(true);
    setError(null);
    setUploadStatus("");

    try {
      // Always upload image
      setUploadStatus("Uploading image to nostr.build...");
      const uploadedUrl = await uploadImageWithFallback(imageData, setUploadStatus);

      if (!uploadedUrl) {
        setError("Failed to upload image. Please try again.");
        setIsPosting(false);
        return;
      }

      // Use provided content or default message
      const noteContent = content.trim() || `Check out my drawing on NostrDraw! 🎨\n\n${window.location.origin}/canvas/${canvasId}`;

      // Publish note with image
      setUploadStatus("Publishing to Nostr...");
      const success = await publishNote(noteContent, uploadedUrl);

      if (success) {
        setPosted(true);
        setUploadStatus("Successfully posted! 🎉");
        setTimeout(() => {
          handleOpenChange(false);
        }, 2000);
      } else {
        setError("Failed to publish note. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setIsPosting(false);
    }
  };

  const elementCount = Array.from(elements.values()).filter(
    (el) => !el.isDeleted
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Post to Nostr
          </DialogTitle>
          <DialogDescription>
            Share your canvas "{canvasName}" with {elementCount} elements on the Nostr network
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Canvas Preview - Always visible */}
          <div className="space-y-2">
            <Label>Your Canvas</Label>
            {imageData ? (
              <>
                <div className="border-2 border-primary/20 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={imageData}
                    alt="Canvas preview"
                    className="w-full h-auto max-h-64 object-contain"
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Upload className="h-3 w-3" />
                  This image will be uploaded to nostr.build and shared with your followers
                </p>
              </>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No canvas found. Draw something first!
                </p>
              </div>
            )}
          </div>

          {/* Note Content - Optional */}
          <div className="space-y-2">
            <Label htmlFor="note-content">
              Add a message <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="note-content"
              placeholder="Share something about your creation... (optional)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {content.length} characters
            </p>
          </div>

          {/* Upload Status */}
          {uploadStatus && !error && !posted && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>{uploadStatus}</AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {posted && (
            <Alert className="bg-green-500/10 text-green-500 border-green-500/20">
              <Check className="h-4 w-4" />
              <AlertDescription>
                Successfully posted to Nostr! 🎉
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="flex-1"
              disabled={isPosting}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePost}
              className="flex-1 gap-2"
              disabled={isPosting || posted || !imageData}
            >
              {isPosting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : posted ? (
                <>
                  <Check className="h-4 w-4" />
                  Posted!
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Share on Nostr
                </>
              )}
            </Button>
          </div>

          {/* Info */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <span className="text-primary mt-0.5">💡</span>
              <span>
                Your canvas will be uploaded to nostr.build and posted with #nostrdraw and #art.
                Your followers will see the image in their feed!
              </span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
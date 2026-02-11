"use client";

import { useState, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Link2, Eye, Edit3, QrCode, Share2, Download } from "lucide-react";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareModal({ open, onOpenChange }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const { canvasId, canvasName, elements } = useCanvasStore();
  const { user } = useNostr();

  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/canvas/${canvasId}${isReadOnly ? "?view=true" : ""}`
    : "";

  // Generate QR code using an API
  useEffect(() => {
    if (shareUrl) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;
      setQrCodeUrl(qrUrl);
    }
  }, [shareUrl]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = `nostrdraw-qr-${canvasId.slice(0, 8)}.png`;
    link.click();
  };

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: canvasName,
          text: `Check out my Nostr drawing: ${canvasName}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed
      }
    }
  };

  const elementCount = Array.from(elements.values()).filter(
    (el) => !el.isDeleted
  ).length;

  const canShare = typeof navigator !== "undefined" && navigator.share;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Canvas
          </DialogTitle>
          <DialogDescription>
            Share "{canvasName}" with {elementCount} elements via link or QR code
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link" className="gap-2">
              <Link2 className="h-4 w-4" />
              Link
            </TabsTrigger>
            <TabsTrigger value="qr" className="gap-2">
              <QrCode className="h-4 w-4" />
              QR Code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 mt-4">
            {/* Share Link */}
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-sm"
                />
                <Button size="icon" onClick={handleCopyLink} variant="outline">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Native Share Button */}
            {canShare && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleShareNative}
              >
                <Share2 className="h-4 w-4" />
                Share via...
              </Button>
            )}

            {/* Permissions */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {isReadOnly ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Edit3 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {isReadOnly ? "View Only Mode" : "Collaborative Mode"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isReadOnly 
                        ? "Viewers cannot make changes" 
                        : "Anyone can draw and collaborate"}
                    </p>
                  </div>
                </div>
                <Switch checked={isReadOnly} onCheckedChange={setIsReadOnly} />
              </div>
            </div>

            {/* Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>This canvas is stored on the Nostr network and is publicly accessible</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Collaborators need a Nostr identity to make changes</span>
              </p>
              {!user && (
                <p className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">⚠</span>
                  <span>Connect your Nostr account to save your changes permanently</span>
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="qr" className="space-y-4 mt-4">
            {/* QR Code Display */}
            <div className="flex flex-col items-center space-y-4">
              <div className="bg-white p-4 rounded-lg">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-muted">
                    <QrCode className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Scan to open canvas</p>
                <p className="text-xs text-muted-foreground">
                  Anyone can scan this QR code to access the canvas
                </p>
              </div>

              {/* QR Actions */}
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleDownloadQR}
                  disabled={!qrCodeUrl}
                >
                  <Download className="h-4 w-4" />
                  Download QR
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Mode Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p>
                {isReadOnly 
                  ? "QR code leads to view-only mode. Scanners won't be able to edit."
                  : "QR code leads to collaborative mode. Scanners can draw and edit."}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
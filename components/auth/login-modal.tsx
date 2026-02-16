"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Chrome, AlertCircle, Smartphone, Copy, Check, Eye } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [npubKey, setNpubKey] = useState("");
  const [copied, setCopied] = useState(false);

  const {
    loginWithExtension,
    loginWithNpub,
    loginWithNostrConnect,
    nostrConnectUri,
    isLoading,
    error,
    user,
  } = useNostr();

  // Close modal when user successfully logs in
  useEffect(() => {
    if (user && open) {
      onOpenChange(false);
    }
  }, [user, open, onOpenChange]);

  // Clear form when modal closes
  useEffect(() => {
    if (!open) {
      setNpubKey("");
      setCopied(false);
    }
  }, [open]);

  const handleExtensionLogin = async () => {
    try {
      await loginWithExtension();
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleNpubLogin = async () => {
    if (!npubKey.trim()) return;
    try {
      await loginWithNpub(npubKey.trim());
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleNostrConnectLogin = async () => {
    try {
      await loginWithNostrConnect();
    } catch (err) {
      console.error("Nostr Connect failed:", err);
    }
  };

  const handleCopyUri = () => {
    if (nostrConnectUri) {
      navigator.clipboard.writeText(nostrConnectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && npubKey.trim()) {
      handleNpubLogin();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            Connect to NostrDraw
          </DialogTitle>
          <DialogDescription>
            Sign in with your Nostr identity to collaborate on canvases. Your drawings
            will be published to the Nostr network.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="extension" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extension">Extension</TabsTrigger>
            <TabsTrigger value="connect">
              <Smartphone className="h-4 w-4 mr-1" />
              Mobile
            </TabsTrigger>
            <TabsTrigger value="npub">
              <Eye className="h-4 w-4 mr-1" />
              View
            </TabsTrigger>
          </TabsList>

          {/* Extension tab - unchanged */}
          <TabsContent value="extension" className="mt-4 space-y-4">
            <div className="text-sm text-muted-foreground">
              Connect using a NIP-07 compatible browser extension like Alby, nos2x, or
              Flamingo.
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleExtensionLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Chrome className="h-4 w-4" />
              )}
              Connect with Extension
            </Button>

            <div className="text-xs text-muted-foreground text-center">
              {"Don't have an extension? "}
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get Alby
              </a>
              {" or "}
              <a
                href="https://github.com/nickkatsios/nos2x"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                nos2x
              </a>
            </div>
          </TabsContent>

          {/* Mobile tab - unchanged */}
          <TabsContent value="connect" className="mt-4 space-y-4">
            <div className="text-sm text-muted-foreground">
              Scan the QR code with your Nostr app (Amber, Alby Go, Nos, etc.) or copy
              the connection string.
            </div>

            {!nostrConnectUri ? (
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleNostrConnectLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                Generate Connection Code
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <QRCodeSVG value={nostrConnectUri} size={200} level="M" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Or copy the connection string:
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={nostrConnectUri}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={handleCopyUri}>
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription className="text-xs">
                    Waiting for approval from your Nostr app...
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center">
              Works with Amber (Android), Alby Go, Nos, and other NIP-46 compatible apps
            </div>
          </TabsContent>

          {/* npub tab - new read-only login */}
          <TabsContent value="npub" className="mt-4 space-y-4">
            <div className="text-sm text-muted-foreground">
              Enter your public key (npub) to browse and draw. Actions that require
              signing (like posting to Nostr) won't be available.
            </div>

            <div className="space-y-2">
              <Label htmlFor="npub">Public Key</Label>
              <div className="relative">
                <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="npub"
                  type="text"
                  placeholder="npub1..."
                  value={npubKey}
                  onChange={(e) => setNpubKey(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleNpubLogin}
              disabled={isLoading || !npubKey.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Browse as Read-Only
            </Button>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Read-only mode: you can draw on canvases but actions like posting to
                Nostr require a full login with extension or mobile app.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">
            {"New to Nostr? "}
            <a
              href="https://nostr.how"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Learn more about Nostr
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
"use client";

import { useState } from "react";
import { useNWC } from "@/lib/nwc-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, AlertCircle, CheckCircle, Unplug } from "lucide-react";

interface NWCSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NWCSettingsModal({ open, onOpenChange }: NWCSettingsModalProps) {
  const { nwcConfigured, nwcEnabled, configureNWC, disconnectNWC } = useNWC();
  const [connectionString, setConnectionString] = useState("");
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConfigure = async () => {
    if (!connectionString.trim()) {
      setError("Please enter a connection string");
      return;
    }

    setIsConfiguring(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await configureNWC(connectionString);
      if (result) {
        setSuccess(true);
        setConnectionString("");
        setTimeout(() => {
          onOpenChange(false);
        }, 2000);
      } else {
        setError("Failed to connect. Please check your connection string.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleDisconnect = () => {
    disconnectNWC();
    setSuccess(false);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Nostr Wallet Connect (NWC)
          </DialogTitle>
          <DialogDescription>
            Connect your Lightning wallet to zap with one click
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {nwcConfigured ? (
            <div className="space-y-4">
              <Alert className="bg-green-500/10 border-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-500">
                  NWC is connected {nwcEnabled ? "and active" : "(reconnecting...)"}
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  ⚡ One-click zaps enabled
                </p>
                <p className="text-xs text-muted-foreground">
                  Your wallet will automatically pay zap invoices without manual confirmation
                </p>
              </div>

              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={handleDisconnect}
              >
                <Unplug className="h-4 w-4" />
                Disconnect NWC
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nwc-string">Connection String</Label>
                <Input
                  id="nwc-string"
                  type="password"
                  placeholder="nostr+walletconnect://..."
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  disabled={isConfiguring}
                />
                <p className="text-xs text-muted-foreground">
                  Get this from your wallet app (Alby, Primal, Coinos, etc.)
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-500">
                    Connected successfully! ⚡
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleConfigure}
                disabled={isConfiguring || !connectionString.trim()}
                className="w-full gap-2"
              >
                {isConfiguring ? (
                  <>Connecting...</>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Connect Wallet
                  </>
                )}
              </Button>

              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium">Where to get NWC:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Alby: alby.com → Settings → Nostr Wallet Connect</li>
                  <li>Primal: Settings → Wallet → Nostr Wallet Connect</li>
                  <li>Coinos: Settings → Nostr Wallet Connect</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
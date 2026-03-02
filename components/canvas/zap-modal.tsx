"use client";

import { useState, useEffect } from "react";
import { useNostr } from "@/lib/nostr-context";
import { useNWC } from "@/lib/nwc-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Zap, Check, AlertCircle, ExternalLink } from "lucide-react";
import { nip19 } from "nostr-tools";
import { QRCodeSVG } from "qrcode.react";

const QUICK_AMOUNTS = [21, 100, 500, 1000, 5000];

interface ZapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPubkey: string;
  recipientName?: string;
  recipientPicture?: string;
  canvasName?: string;
}

interface LnurlData {
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export function ZapModal({
  open,
  onOpenChange,
  recipientPubkey,
  recipientName,
  recipientPicture,
  canvasName,
}: ZapModalProps) {
  const { pool, relays, user } = useNostr();

  const [amount, setAmount] = useState<number>(21);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [step, setStep] = useState<"amount" | "invoice" | "success" | "paid">("amount");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lnAddress, setLnAddress] = useState<string | null>(null);
  const { nwcEnabled, sendPayment } = useNWC();

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setAmount(21);
      setCustomAmount("");
      setComment("");
      setStep("amount");
      setInvoice(null);
      setError(null);
      setLnAddress(null);
      fetchLightningAddress();
    }
  }, [open, recipientPubkey]);

  // Fetch lightning address from recipient's nostr profile
  const fetchLightningAddress = async () => {
    if (!pool) return;
    try {
      const events = await pool.querySync(relays, {
        kinds: [0],
        authors: [recipientPubkey],
        limit: 1,
      });

      if (events.length > 0) {
        const metadata = JSON.parse(events[0].content);
        const lnurl = metadata.lud16 || metadata.lud06;
        if (lnurl) setLnAddress(lnurl);
      }
    } catch (err) {
      console.error("Failed to fetch lightning address:", err);
    }
  };

  // Resolve LNURL / lightning address to callback URL
  const resolveLnurl = async (lnurl: string): Promise<LnurlData | null> => {
    try {
      let url: string;

      if (lnurl.includes("@")) {
        // Lightning address format: user@domain.com
        const [name, domain] = lnurl.split("@");
        url = `https://${domain}/.well-known/lnurlp/${name}`;
      } else if (lnurl.toLowerCase().startsWith("lnurl")) {
  // Bech32 encoded LNURL — decodificar manualmente sin nip19
  // nip19 no maneja lnurl, usar atob con bech32 no es trivial
  // La mayoría de wallets modernas usan lud16 (lightning address)
  // así que este caso es raro — simplemente usar como URL directa
  url = lnurl;
} else {
        url = lnurl;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch LNURL data");
      return await response.json();
    } catch (err) {
      console.error("Failed to resolve LNURL:", err);
      return null;
    }
  };

  // Generate invoice
  const handleGenerateInvoice = async () => {
    const finalAmount = customAmount ? parseInt(customAmount) : amount;

    if (!finalAmount || finalAmount < 1) {
      setError("Please enter a valid amount");
      return;
    }

    if (!lnAddress) {
      setError("This user has no Lightning address configured in their Nostr profile.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const lnurlData = await resolveLnurl(lnAddress);
      if (!lnurlData) throw new Error("Could not resolve Lightning address");

      const amountMsats = finalAmount * 1000;

      if (amountMsats < lnurlData.minSendable) {
        throw new Error(`Minimum amount is ${lnurlData.minSendable / 1000} sats`);
      }
      if (amountMsats > lnurlData.maxSendable) {
        throw new Error(`Maximum amount is ${lnurlData.maxSendable / 1000} sats`);
      }

      // Build callback URL
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set("amount", amountMsats.toString());
      if (comment) callbackUrl.searchParams.set("comment", comment);

      // Add nostr zap request if supported
      if (lnurlData.allowsNostr && lnurlData.nostrPubkey && user && !user.readOnly) {
        // Could add NIP-57 zap request here for full zap support
        // For now we send a simple LNURL payment
      }

      const invoiceResponse = await fetch(callbackUrl.toString());
      if (!invoiceResponse.ok) throw new Error("Failed to generate invoice");

      const invoiceData = await invoiceResponse.json();
      if (invoiceData.status === "ERROR") throw new Error(invoiceData.reason);
      if (!invoiceData.pr) throw new Error("No payment request received");

      setInvoice(invoiceData.pr);
      setStep("invoice");
      if (nwcEnabled) {
  console.log("💸 NWC enabled, attempting auto-payment...");
  try {
    const paymentResult = await sendPayment(invoiceData.pr);
    if (paymentResult) {
      console.log("✅ Payment successful via NWC!");
      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } else {
      console.log("❌ NWC payment failed, showing invoice for manual payment");
      // Si falla NWC, el usuario puede pagar manualmente
    }
  } catch (err) {
    console.error("NWC payment error:", err);
    // Si falla NWC, el usuario puede pagar manualmente
  }
}
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoice");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyInvoice = async () => {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice);
  };

  const handleOpenWallet = () => {
    if (!invoice) return;
    window.open(`lightning:${invoice}`, "_blank");
  };

  const finalAmount = customAmount ? parseInt(customAmount) || 0 : amount;
  const displayName = recipientName || `${recipientPubkey.slice(0, 8)}...`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            Zap {displayName}
          </DialogTitle>
          <DialogDescription>
            {canvasName
              ? `Send sats for their work on "${canvasName}"`
              : "Send sats to support this creator"}
          </DialogDescription>
        </DialogHeader>

        {/* Recipient info */}
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Avatar className="w-10 h-10">
            {recipientPicture && <AvatarImage src={recipientPicture} />}
            <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-sm">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {lnAddress || "Checking Lightning address..."}
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "amount" && (
          <div className="space-y-4">
            {/* Quick amounts */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick amounts (sats)</p>
              <div className="grid grid-cols-5 gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => { setAmount(a); setCustomAmount(""); }}
                    className={`py-2 px-1 rounded-lg text-xs font-mono font-medium border transition-all ${
                      amount === a && !customAmount
                        ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                        : "border-border hover:border-yellow-500/30 hover:bg-yellow-500/10 text-muted-foreground"
                    }`}
                  >
                    ⚡{a}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom amount */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Or enter custom amount</p>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-yellow-400" />
                <Input
                  type="number"
                  placeholder="Custom amount in sats"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="pl-10"
                  min={1}
                />
              </div>
            </div>

            {/* Comment */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Message (optional)</p>
              <Input
                placeholder="Great drawing! ⚡"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={144}
              />
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-yellow-400 font-mono">
                ⚡ {finalAmount.toLocaleString()} sats
              </span>
            </div>

            <Button
              className="w-full gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
              onClick={handleGenerateInvoice}
              disabled={isLoading || !lnAddress || finalAmount < 1}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {isLoading ? "Generating invoice..." : "Generate Invoice"}
            </Button>

            {!lnAddress && !isLoading && (
              <p className="text-xs text-center text-muted-foreground">
                This user hasn't set up a Lightning address in their Nostr profile yet.
              </p>
            )}
          </div>
        )}

        {step === "invoice" && invoice && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Scan with your Lightning wallet or open in app
            </p>

            {/* QR Code */}
            <div className="flex justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG
                value={invoice.toUpperCase()}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Amount badge */}
            <div className="flex justify-center">
              <div className="px-4 py-1.5 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-yellow-400 font-mono text-sm font-semibold">
                ⚡ {finalAmount.toLocaleString()} sats
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleCopyInvoice}
              >
                <Check className="h-4 w-4" />
                Copy Invoice
              </Button>
              <Button
                className="gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                onClick={handleOpenWallet}
              >
                <ExternalLink className="h-4 w-4" />
                Open Wallet
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={() => { setStep("amount"); setInvoice(null); }}
            >
              ← Change amount
            </Button>
          </div>
        )}

        {step === "success" && (
  <div className="text-center py-8">
    <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
      <Check className="h-8 w-8 text-green-500" />
    </div>
    <h3 className="text-lg font-medium mb-2">Payment Sent! ⚡</h3>
    <p className="text-sm text-muted-foreground">
      Your zap has been sent successfully
    </p>
  </div>
)}

        {step === "paid" && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 text-yellow-400" />
            </div>
            <p className="text-lg font-semibold">Zap sent! ⚡</p>
            <p className="text-sm text-muted-foreground">
              You sent {finalAmount.toLocaleString()} sats to {displayName}
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
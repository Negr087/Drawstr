"use client";

import { useState } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { downloadSVG, downloadPNG, downloadJSON, copyCanvasToClipboard } from "@/lib/export";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, ImageIcon, FileCode, FileJson, Copy, Check } from "lucide-react";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const [format, setFormat] = useState<"png" | "svg" | "json">("png");
  const [scale, setScale] = useState<"1" | "2" | "3">("2");
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const { elements, canvasId, canvasName } = useCanvasStore();

  const handleExport = () => {
    const filename = `nostrdraw-${canvasName.replace(/\s+/g, "-").toLowerCase()}-${canvasId.slice(0, 8)}`;

    if (format === "svg") {
      downloadSVG(elements, filename);
    } else if (format === "json") {
      downloadJSON(elements, canvasId, canvasName);
    } else {
      downloadPNG(elements, filename, parseInt(scale));
    }

    onOpenChange(false);
  };

  const handleCopyToClipboard = async () => {
    setIsCopying(true);
    const success = await copyCanvasToClipboard(elements);
    setIsCopying(false);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const elementCount = Array.from(elements.values()).filter(
    (el) => !el.isDeleted
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Canvas
          </DialogTitle>
          <DialogDescription>
            Export your canvas with {elementCount} elements in your preferred format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label>Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(value: string) => setFormat(value as "png" | "svg" | "json")}
              className="grid grid-cols-3 gap-3"
            >
              <Label
                htmlFor="png"
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${format === "png"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                  }`}
              >
                <RadioGroupItem value="png" id="png" className="sr-only" />
                <ImageIcon className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="font-medium text-sm">PNG</p>
                  <p className="text-xs text-muted-foreground">Raster</p>
                </div>
              </Label>

              <Label
                htmlFor="svg"
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${format === "svg"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                  }`}
              >
                <RadioGroupItem value="svg" id="svg" className="sr-only" />
                <FileCode className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="font-medium text-sm">SVG</p>
                  <p className="text-xs text-muted-foreground">Vector</p>
                </div>
              </Label>

              <Label
                htmlFor="json"
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${format === "json"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                  }`}
              >
                <RadioGroupItem value="json" id="json" className="sr-only" />
                <FileJson className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="font-medium text-sm">JSON</p>
                  <p className="text-xs text-muted-foreground">Data</p>
                </div>
              </Label>
            </RadioGroup>
          </div>

          {/* Scale Selection (PNG only) */}
          {format === "png" && (
            <div className="space-y-3">
              <Label>Quality Scale</Label>
              <RadioGroup
                value={scale}
                onValueChange={(value: string) => setScale(value as "1" | "2" | "3")}
                className="grid grid-cols-3 gap-3"
              >
                {(["1", "2", "3"] as const).map((s) => (
                  <Label
                    key={s}
                    htmlFor={`scale-${s}`}
                    className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors ${scale === s
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                      }`}
                  >
                    <RadioGroupItem
                      value={s}
                      id={`scale-${s}`}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <p className="font-medium">{s}x</p>
                      <p className="text-xs text-muted-foreground">
                        {s === "1" ? "Standard" : s === "2" ? "High" : "Ultra"}
                      </p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Format Description */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            {format === "png" && (
              <p>PNG exports as a raster image. Higher scales produce larger files with better quality.</p>
            )}
            {format === "svg" && (
              <p>SVG exports as scalable vector graphics. Perfect for editing in design tools or printing.</p>
            )}
            {format === "json" && (
              <p>JSON exports all canvas data. Use this to backup or import your drawing into another canvas.</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleExport}
              disabled={elementCount === 0}
            >
              <Download className="h-4 w-4" />
              Download as {format.toUpperCase()}
            </Button>

            {format === "png" && (
              <Button
                variant="outline"
                className="w-full gap-2"
                size="lg"
                onClick={handleCopyToClipboard}
                disabled={elementCount === 0 || isCopying}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            )}
          </div>

          {elementCount === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Add some elements to your canvas before exporting.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
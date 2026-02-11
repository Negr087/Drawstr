"use client";

import { useState } from "react";
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
import { Save, Loader2, Check, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SaveCanvasModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SaveCanvasModal({ open, onOpenChange }: SaveCanvasModalProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const { elements, canvasId, canvasName, setCanvasName } = useCanvasStore();
    const { saveCanvasState, user } = useNostr();

    const [localName, setLocalName] = useState(canvasName);

    const elementCount = Array.from(elements.values()).filter(
        (el) => !el.isDeleted
    ).length;

    const handleSave = async () => {
        if (!user) {
            setErrorMessage("You need to be logged in to save");
            setSaveStatus("error");
            return;
        }

        if (!localName.trim()) {
            setErrorMessage("Please enter a canvas name");
            setSaveStatus("error");
            return;
        }

        setIsSaving(true);
        setSaveStatus("idle");
        setErrorMessage("");

        try {
            // Actualizar el nombre en el store si cambió
            if (localName !== canvasName) {
                setCanvasName(localName);
            }

            // Guardar en Nostr
            const success = await saveCanvasState(canvasId, localName);

            if (success) {
                setSaveStatus("success");
                // Cerrar el modal después de 1.5 segundos
                setTimeout(() => {
                    onOpenChange(false);
                    setSaveStatus("idle");
                }, 1500);
            } else {
                setSaveStatus("error");
                setErrorMessage("Failed to save to relays. Please try again.");
            }
        } catch (error) {
            console.error("Save error:", error);
            setSaveStatus("error");
            setErrorMessage("An unexpected error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!isSaving) {
            onOpenChange(newOpen);
            // Reset estados al cerrar
            if (!newOpen) {
                setSaveStatus("idle");
                setErrorMessage("");
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Save className="h-5 w-5" />
                        Save to Nostr
                    </DialogTitle>
                    <DialogDescription>
                        Save your canvas with {elementCount} elements to Nostr relays.
                        Your canvas will be accessible from any device.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Canvas Name Input */}
                    <div className="space-y-2">
                        <Label htmlFor="canvas-name">Canvas Name</Label>
                        <Input
                            id="canvas-name"
                            placeholder="Enter a name for your canvas..."
                            value={localName}
                            onChange={(e) => setLocalName(e.target.value)}
                            disabled={isSaving}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSaving) {
                                    handleSave();
                                }
                            }}
                        />
                    </div>

                    {/* Canvas Info */}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Elements:</span>
                            <span className="font-medium">{elementCount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Canvas ID:</span>
                            <span className="font-mono text-xs">{canvasId.slice(0, 12)}...</span>
                        </div>
                        {user && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Author:</span>
                                <span className="font-medium text-xs">
                                    {user.name || user.npub.slice(0, 12)}...
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Success Alert */}
                    {saveStatus === "success" && (
                        <Alert className="bg-green-500/10 border-green-500/50">
                            <Check className="h-4 w-4 text-green-500" />
                            <AlertDescription className="text-green-500">
                                Canvas saved successfully to Nostr relays!
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Error Alert */}
                    {saveStatus === "error" && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{errorMessage}</AlertDescription>
                        </Alert>
                    )}

                    {/* Info about Nostr */}
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                        💡 Your canvas is saved using NIP-33 (Parameterized Replaceable Events).
                        Each save overwrites the previous version on relays.
                    </div>

                    {/* Save Button */}
                    <Button
                        className="w-full gap-2"
                        size="lg"
                        onClick={handleSave}
                        disabled={isSaving || elementCount === 0 || !user || saveStatus === "success"}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving to relays...
                            </>
                        ) : saveStatus === "success" ? (
                            <>
                                <Check className="h-4 w-4" />
                                Saved!
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                Save to Nostr
                            </>
                        )}
                    </Button>

                    {/* Warning if no user */}
                    {!user && (
                        <p className="text-sm text-amber-500 text-center">
                            ⚠️ Please login with Nostr to save your canvas
                        </p>
                    )}

                    {/* Warning if no elements */}
                    {elementCount === 0 && user && (
                        <p className="text-sm text-muted-foreground text-center">
                            Add some elements to your canvas before saving.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
"use client";

import { useState, useEffect } from "react"; // ← Agregar useEffect
import { useRouter } from "next/navigation";
import { useNostr } from "@/lib/nostr-context"; // ← NUEVO import
import { getLastCanvas } from "@/lib/use-last-canvas"; // ← NUEVO import
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Palette, 
  Users, 
  Zap, 
  Shield, 
  ArrowRight,
  Sparkles,
  Globe,
  Pencil
} from "lucide-react";
import { generateId } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { user } = useNostr(); // ← NUEVO
  const [canvasId, setCanvasId] = useState("");

  useEffect(() => {
    if (user) {
      const lastCanvas = getLastCanvas(user.pubkey);
      
      if (lastCanvas) {
        // Redirigir al último canvas usado
        router.push(`/canvas/${lastCanvas}`);
      }
      // Si no tiene último canvas, se queda en la home
    }
  }, [user, router]);

  const createNewCanvas = () => {
    const newId = generateId();
    router.push(`/canvas/${newId}`);
  };

  const joinCanvas = () => {
    if (canvasId.trim()) {
      router.push(`/canvas/${canvasId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-xl">NostrDraw</span>
          </div>
          <Button variant="outline" onClick={createNewCanvas}>
            Start Drawing
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Powered by Nostr Protocol
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Draw Together,
            <span className="text-primary"> Anywhere</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A decentralized collaborative canvas where creativity knows no bounds. 
            No accounts, no servers, just pure creation on the Nostr network.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
            <Button 
              size="lg" 
              onClick={createNewCanvas}
              className="gap-2 text-lg px-8"
            >
              <Pencil className="h-5 w-5" />
              Create New Canvas
            </Button>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder="Enter canvas ID..."
                value={canvasId}
                onChange={(e) => setCanvasId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinCanvas()}
                className="max-w-xs"
              />
              <Button 
                variant="outline" 
                size="lg"
                onClick={joinCanvas}
                disabled={!canvasId.trim()}
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Real-time Collaboration</CardTitle>
              <CardDescription>
                Draw together with anyone, anywhere in the world. See cursors and changes in real-time.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Decentralized</CardTitle>
              <CardDescription>
                Built on Nostr protocol. No central servers, no censorship, complete ownership of your art.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Instant Start</CardTitle>
              <CardDescription>
                No sign-up required to start. Connect your Nostr identity only when you want to save.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Infinite Canvas</CardTitle>
              <CardDescription>
                Unlimited space to create. Pan, zoom, and draw without boundaries or limitations.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Tools Preview */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Powerful Drawing Tools
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to bring your ideas to life
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
            {[
              { icon: "▭", label: "Rectangle" },
              { icon: "○", label: "Ellipse" },
              { icon: "→", label: "Arrow" },
              { icon: "✏", label: "Free Draw" },
              { icon: "T", label: "Text" },
              { icon: "◉", label: "Select" },
              { icon: "⊗", label: "Eraser" },
              { icon: "✋", label: "Pan" },
            ].map((tool) => (
              <div
                key={tool.label}
                className="p-4 rounded-lg border border-border/50 bg-card/30 backdrop-blur hover:bg-card/50 transition-colors"
              >
                <div className="text-3xl mb-2">{tool.icon}</div>
                <div className="text-sm font-medium">{tool.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="border-primary/20 bg-primary/5 backdrop-blur">
          <CardContent className="p-12 text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">
              Ready to Start Creating?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join the decentralized creative revolution. No barriers, no limits, just pure artistic freedom.
            </p>
            <Button size="lg" onClick={createNewCanvas} className="gap-2">
              <Palette className="h-5 w-5" />
              Create Your Canvas Now
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Palette className="h-4 w-4" />
              <span>NostrDraw - Decentralized Collaborative Canvas</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Built with ❤️ on Nostr
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
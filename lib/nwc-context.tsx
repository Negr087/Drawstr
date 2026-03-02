"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { NostrWebLNProvider } from "@getalby/sdk";

interface NWCContextType {
  nwcEnabled: boolean;
  nwcConfigured: boolean;
  configureNWC: (connectionString: string) => Promise<boolean>;
  disconnectNWC: () => void;
  sendPayment: (invoice: string) => Promise<{ preimage: string } | null>;
}

const NWCContext = createContext<NWCContextType | undefined>(undefined);

export function NWCProvider({ children }: { children: ReactNode }) {
  const [nwcEnabled, setNwcEnabled] = useState(false);
  const [nwcConfigured, setNwcConfigured] = useState(false);
  const [provider, setProvider] = useState<any>(null);

  // Cargar NWC guardado al iniciar
  useEffect(() => {
    const savedNWC = localStorage.getItem("nwc_connection");
    if (savedNWC) {
      setNwcConfigured(true);
      initializeNWC(savedNWC);
    }
  }, []);

  const initializeNWC = async (connectionString: string) => {
  try {
    const nwcProvider = new NostrWebLNProvider({  // ← Ya no usa webln.
      nostrWalletConnectUrl: connectionString,
    });
    
    await nwcProvider.enable();
    setProvider(nwcProvider);
    setNwcEnabled(true);
    console.log("✅ NWC connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize NWC:", error);
    setNwcEnabled(false);
    return false;
  }
};

  const configureNWC = async (connectionString: string): Promise<boolean> => {
    try {
      // Validar formato básico
      if (!connectionString.startsWith("nostr+walletconnect://")) {
        throw new Error("Invalid NWC connection string format");
      }

      // Guardar en localStorage
      localStorage.setItem("nwc_connection", connectionString);
      
      // Inicializar
      const success = await initializeNWC(connectionString);
      if (success) {
        setNwcConfigured(true);
      }
      
      return success;
    } catch (error) {
      console.error("Failed to configure NWC:", error);
      return false;
    }
  };

  const disconnectNWC = () => {
    localStorage.removeItem("nwc_connection");
    setNwcConfigured(false);
    setNwcEnabled(false);
    setProvider(null);
    console.log("🔌 NWC disconnected");
  };

  const sendPayment = async (invoice: string): Promise<{ preimage: string } | null> => {
    if (!provider || !nwcEnabled) {
      console.error("NWC not enabled");
      return null;
    }

    try {
      console.log("💸 Sending payment via NWC...");
      const response = await provider.sendPayment(invoice);
      console.log("✅ Payment sent:", response);
      return response;
    } catch (error) {
      console.error("❌ Payment failed:", error);
      return null;
    }
  };

  return (
    <NWCContext.Provider
      value={{
        nwcEnabled,
        nwcConfigured,
        configureNWC,
        disconnectNWC,
        sendPayment,
      }}
    >
      {children}
    </NWCContext.Provider>
  );
}

export function useNWC() {
  const context = useContext(NWCContext);
  if (!context) {
    throw new Error("useNWC must be used within NWCProvider");
  }
  return context;
}
import React from "react"
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from "next/font/google";
import { NostrProvider } from '@/lib/nostr-context'
import './globals.css'

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'NostrDraw - Decentralized Collaborative Canvas',
  description: 'A collaborative infinite canvas for drawing, powered by the Nostr protocol. Draw together in real-time without accounts or servers.',
  generator: 'NostrDraw',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <NostrProvider>
          {children}
        </NostrProvider>
      </body>
    </html>
  )
}
import type { Metadata, Viewport } from "next";
import { PWAInitialize } from "../components/PWAInitialize";
import { NativePopupSystem } from "../components/NativePopupSystem";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthContextProvider } from "../context/AuthContext";
import { ToastProvider } from "../components/ToastProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VastraaOS",
  description: "Outfit Rental Order Management and Delivery Handling System",
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VastraaOS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#2e31fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-gray-100 text-gray-900">
      <body className={`${inter.variable} antialiased h-full`}>
        <div className="animate-fade-in duration-500 ease-in-out">
          <AuthContextProvider>
            <ToastProvider>
              <PWAInitialize />
              <NativePopupSystem />
              {children}
            </ToastProvider>
          </AuthContextProvider>
        </div>
      </body>
    </html>
  );
}

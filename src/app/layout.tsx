import type { Metadata } from "next";
import "./globals.css";
import StoreProvider from "./StoreProvider";
import BootstrapClient from "@/components/BootstrapClient";

export const metadata: Metadata = {
  title: "Hyperlocal Admin",
  description: "Hyperlocal FreshCart Admin Panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <StoreProvider>
          {children}
          <BootstrapClient />
        </StoreProvider>
      </body>
    </html>
  );
}

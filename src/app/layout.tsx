import type { Metadata } from "next";
import "./globals.css";
import StoreProvider from "./StoreProvider";
import BootstrapClient from "@/components/BootstrapClient";

export const metadata: Metadata = {
  title: "Aruun Doorstep",
  description: "Aruun Doorstep - Your Trusted Wholesale Partner - Since 2005",
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

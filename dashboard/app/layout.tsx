import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = { title: "LeakGuard Organization", description: "Organization-wide resource leak governance" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell"><Nav/><main>{children}</main></div></body></html>;
}

import "./globals.css";

import { AppHeader } from "./components/AppHeader";
import { ThemeInitializer } from "./components/ThemeInitializer";
import { AuthProvider, AuthGuard } from "./contexts/AuthContext";

export const metadata = {
  title: "DevBloom Studio",
  description: "DevBloom Studio – Agents, Admin, Storyboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="app-layout">
            <ThemeInitializer />
            <AppHeader />
            <AuthGuard>{children}</AuthGuard>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

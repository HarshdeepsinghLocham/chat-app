'use client'

import { ThemeProvider } from "@/providers/theme-provider";
import { AppQueryProvider } from "@/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/context/UserContext";
import { SocketProvider } from "@/providers/socket-provider";
import { NotificationTray } from "@/components/notifications/notification-tray";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
      <UserProvider>
        <AppQueryProvider>
          <SocketProvider>
            {children}
            <div className="fixed right-4 top-4 z-40">
              <NotificationTray />
            </div>
          </SocketProvider>
          <Toaster />
        </AppQueryProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
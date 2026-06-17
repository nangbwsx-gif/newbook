"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { ToastProvider } from "@/components/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    }

    fetchUser();
  }, [setUser, setLoading]);

  return <ToastProvider>{children}</ToastProvider>;
}

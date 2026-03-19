"use client"

import React from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";

export function Layout({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const showBottomNav = pathname !== "/login" && pathname !== "/forgot-password" && pathname !== "/update-password";

  return (
    <div className="app-screen-shell">
      <div
        className={cn(
          "app-screen-frame",
          className
        )}
      >
        {children}
        {showBottomNav && <BottomNav />}
      </div>
    </div>
  );
}

export function Header({ title, user, onLogout, logoutLoading }: { title?: string, user?: string, onLogout?: () => void, logoutLoading?: boolean }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      {title ? (
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">{title}</h1>
      ) : (
        <div className="flex items-center">
          <Image
            src="/assets/acomLogo.png"
            alt="ACOM Painting"
            width={64}
            height={40}
            className="h-10 w-auto"
            unoptimized
            priority
          />
        </div>
      )}

      {(user || onLogout) && (
        <div className="flex items-center gap-3">
          {user && !logoutLoading && <span className="text-sm font-medium text-slate-500">{user}</span>}
          {onLogout && (
            <button
              type="button"
              onClick={logoutLoading ? undefined : onLogout}
              disabled={logoutLoading}
              className="flex items-center gap-2 rounded-full px-2 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-90"
              aria-label={logoutLoading ? "Logging out" : "Log out"}
            >
              {logoutLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <span className="text-sm font-medium">Logging out</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                  <span className="text-sm font-medium">Log out</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </header>
  );
}

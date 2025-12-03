import React from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";

export function Layout({ children, className }: { children: React.ReactNode; className?: string }) {
  const [location] = useLocation();
  const showBottomNav = location !== "/login";

  return (
    <div className="min-h-screen bg-muted flex justify-center">
      <div className={cn("w-full max-w-md bg-background min-h-screen shadow-xl flex flex-col relative", className)}>
        {children}
        {showBottomNav && <BottomNav />}
      </div>
    </div>
  );
}

export function Header({ title, user, onLogout }: { title?: string, user?: string, onLogout?: () => void }) {
  return (
    <header className="bg-secondary text-secondary-foreground p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
      {title ? (
        <h1 className="text-xl font-bold tracking-wide text-white">{title}</h1>
      ) : (
        <div className="font-heading font-bold text-lg text-white">Roof Worx</div>
      )}
      
      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">{user}</span>
          {onLogout && (
            <button onClick={onLogout} className="text-gray-300 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </header>
  );
}

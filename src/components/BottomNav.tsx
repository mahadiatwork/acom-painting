"use client"

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, List, Briefcase, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigationLoading } from "@/contexts/NavigationLoadingContext";

const navItems = [
  { label: "Home",        icon: Home,     href: "/",        loadLabel: "Dashboard" },
  { label: "All Entries", icon: List,     href: "/history", loadLabel: "All Entries" },
  { label: "Projects",    icon: Briefcase,href: "/projects", loadLabel: "Projects" },
  { label: "Notice",      icon: Bell,     href: "/notices", loadLabel: "Notices" },
  { label: "Profile",     icon: User,     href: "/profile", loadLabel: "Profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { startLoading } = useNavigationLoading();

  if (pathname === "/select-foreman") return null;

  const handleNav = (href: string, loadLabel: string) => {
    if (pathname === href) return; // already here, no-op
    startLoading(loadLabel);
    router.push(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="max-w-md mx-auto rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex justify-around items-center h-[74px] max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item.href, item.loadLabel)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full px-3 py-2 transition-colors active:scale-95 touch-manipulation rounded-2xl",
                  isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <item.icon
                  size={23}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn("mb-1", isActive && "drop-shadow-sm")}
                />
                <span className={cn("text-[11px] font-medium leading-none", isActive && "text-primary")}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

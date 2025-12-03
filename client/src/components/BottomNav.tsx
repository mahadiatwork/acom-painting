import React from "react";
import { Link, useLocation } from "wouter";
import { Home, List, BookOpen, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { label: "Home", icon: Home, href: "/" },
    { label: "All Entries", icon: List, href: "/history" },
    { label: "Resources", icon: BookOpen, href: "/resources" },
    { label: "Profile", icon: User, href: "/profile" },
    { label: "Notice", icon: Bell, href: "/notices" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-30 pb-safe">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.label} href={item.href}>
              <div className={cn(
                "flex flex-col items-center justify-center w-full h-full px-2 py-1 transition-colors active:scale-95 touch-manipulation",
                isActive ? "text-primary" : "text-gray-400 hover:text-gray-600"
              )}>
                <item.icon 
                  size={24} 
                  strokeWidth={isActive ? 2.5 : 2} 
                  className={cn("mb-1", isActive && "fill-current/10")}
                />
                <span className="text-[10px] font-medium leading-none tracking-wide">
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

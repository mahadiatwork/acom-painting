"use client"

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  variant?: "primary" | "outline" | "ghost" | "secondary" | "destructive";
}

export function PrimaryButton({
  children,
  className,
  fullWidth = true,
  variant = "primary",
  ...props
}: PrimaryButtonProps) {
  const baseStyles = "h-14 rounded-2xl text-base font-semibold transition-all active:scale-[0.99] touch-manipulation cursor-pointer shadow-[0_10px_24px_rgba(13,148,136,0.18)]";

  const variantStyles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/95 shadow-[0_10px_24px_rgba(15,23,42,0.18)]",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50 bg-white shadow-none",
    ghost: "hover:bg-accent hover:text-accent-foreground shadow-none",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_10px_24px_rgba(220,38,38,0.18)]"
  };

  return (
    <Button
      className={cn(
        baseStyles,
        variantStyles[variant],
        fullWidth ? "w-full" : "",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}




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
  const baseStyles = "h-12 text-base font-semibold transition-all active:scale-95 touch-manipulation";
  
  const variantStyles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    outline: "border-2 border-primary text-primary hover:bg-primary/10 bg-transparent",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

"use client"

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function InputField({ label, id, className, error, ...props }: InputFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-gray-700">
        {label}
      </Label>
      <Input
        id={id}
        className={cn(
          "h-12 text-base bg-white border-gray-300 focus:border-primary focus:ring-primary",
          error && "border-destructive focus:border-destructive focus:ring-destructive",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-destructive font-medium">{error}</p>}
    </div>
  );
}

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function TextAreaField({ label, id, className, error, ...props }: TextAreaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-gray-700">
        {label}
      </Label>
      <Textarea
        id={id}
        className={cn(
          "min-h-[100px] text-base bg-white border-gray-300 focus:border-primary focus:ring-primary resize-none",
          error && "border-destructive focus:border-destructive focus:ring-destructive",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-destructive font-medium">{error}</p>}
    </div>
  );
}


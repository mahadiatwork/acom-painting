"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function UpdatePassword() {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
        data: { force_password_change: false }
      });

      if (error) throw error;

      // Fire and forget sign out to speed up UI
      supabase.auth.signOut();

      toast({
        title: "Success",
        description: "Password updated. Please login with your new password.",
      });

      router.push("/login");
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="bg-transparent">
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md app-soft-card px-7 py-10 md:px-8 md:py-12">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-6 rounded-[1.5rem] bg-slate-50 px-7 py-5 shadow-inner">
              <img
                src="/assets/acomLogo.png"
                alt="ACOM Painting Logo"
                width={180}
                height={108}
                className="h-20 w-auto"
              />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Security Update</p>
            <h2 className="app-section-title text-[2.1rem]">Update Password</h2>
            <p className="app-subtle-text mt-3 max-w-sm">
              For your security, set a new password before continuing to the app.
            </p>
          </div>

          <form onSubmit={handleUpdate} className="space-y-5">
            <InputField
              label="New Password"
              id="new-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <InputField
              label="Confirm Password"
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <div className="pt-3">
              <PrimaryButton type="submit" disabled={loading} className="text-lg">
                {loading ? "Updating..." : "Set Password & Login"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

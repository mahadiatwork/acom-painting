"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const router = useRouter();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data.user?.user_metadata?.force_password_change) {
        toast({
          title: "Password Update Required",
          description: "Please set a new password to continue.",
        });
        router.push("/update-password");
      } else {
        router.push("/select-foreman");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials.",
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
            <div className="mb-6 rounded-[1.75rem] bg-slate-50 px-8 py-6 shadow-inner">
              <img
                src="/assets/acomLogo.png"
                alt="ACOM Painting Logo"
                width={220}
                height={140}
                className="h-24 w-auto"
                suppressHydrationWarning
              />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Foreman Timesheet</p>
            <h2 className="app-section-title text-[2.25rem]">Sign in</h2>
            <p className="app-subtle-text mt-3 max-w-sm">
              Use the shared login to access the crew dashboard. You’ll choose which foreman you’re managing right after sign-in.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <InputField
              label="Email"
              id="identifier"
              type="email"
              placeholder="name@acompainting.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <InputField
              label="Password"
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="pt-3">
              <PrimaryButton type="submit" disabled={loading} className="flex items-center justify-center gap-2 text-lg">
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    <span>Logging in...</span>
                  </>
                ) : (
                  "Sign In"
                )}
              </PrimaryButton>
            </div>

            <div className="pt-2 text-center">
              <Link href="/forgot-password" className="text-sm font-medium text-slate-400 transition-colors hover:text-primary">
                Forgot Password?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

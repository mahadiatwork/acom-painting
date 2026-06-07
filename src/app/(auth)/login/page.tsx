"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSelectedForeman } from "@/contexts/SelectedForemanContext";

export default function Login() {
  const router = useRouter();
  const { toast } = useToast();
  const { clearForeman } = useSelectedForeman();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

      // Show success state before navigating
      clearForeman();
      setSuccess(true);

      await new Promise((resolve) => setTimeout(resolve, 1600));

      if (data.user?.user_metadata?.force_password_change) {
        router.replace("/update-password");
      } else {
        router.replace("/select-foreman");
      }
    } catch (error: any) {
      setLoading(false);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials.",
        variant: "destructive",
      });
    }
    // Note: we intentionally do NOT call setLoading(false) on success —
    // keep the button disabled while navigating away.
  };

  return (
    <Layout className="bg-transparent">
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md flex flex-col items-stretch gap-3">

          {/* ── Success snackbar (slides in above the card) ── */}
          <div
            aria-live="polite"
            className={[
              "flex items-center gap-3 rounded-2xl px-4 py-3.5",
              "bg-emerald-500 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)]",
              "transition-all duration-500 ease-out overflow-hidden",
              success
                ? "opacity-100 translate-y-0 max-h-20"
                : "opacity-0 -translate-y-2 max-h-0 py-0 pointer-events-none",
            ].join(" ")}
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none mb-0.5">Signed in successfully!</p>
              <p className="text-xs text-emerald-100">Taking you to the crew dashboard…</p>
            </div>
          </div>

          {/* ── Login card ── */}
          <div className="w-full app-soft-card px-7 py-10 md:px-8 md:py-12 overflow-hidden relative">

            {/* Progress bar at the very top of the card */}
            <div
              className={[
                "absolute top-0 left-0 h-[3px] bg-emerald-500 rounded-t-[1.5rem]",
                "transition-all ease-linear",
                success ? "w-full duration-[1500ms]" : "w-0 duration-0",
              ].join(" ")}
            />

            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 rounded-[1.75rem] bg-slate-50 px-8 py-6 shadow-inner">
                <Image
                  src="/assets/acomLogo.png"
                  alt="ACOM Painting Logo"
                  width={220}
                  height={140}
                  className="h-24 w-auto"
                  priority
                  suppressHydrationWarning
                />
              </div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Crew Timesheet</p>
              <h2 className="app-section-title text-[2.25rem]">Sign in</h2>
              <p className="app-subtle-text mt-3 max-w-sm">
                Use the shared login to access the crew dashboard. You&apos;ll choose the submitter (who is managing the crew) right after sign-in.
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
                <PrimaryButton
                  type="submit"
                  disabled={loading}
                  className={[
                    "flex items-center justify-center gap-2 text-lg transition-colors",
                    success ? "bg-emerald-500 hover:bg-emerald-500" : "",
                  ].join(" ")}
                >
                  {success ? (
                    <>
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                      <span>Signed in!</span>
                    </>
                  ) : loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    "Sign In"
                  )}
                </PrimaryButton>
              </div>

              <div className="pt-2 text-center">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-slate-400 transition-colors hover:text-primary"
                >
                  Forgot Password?
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}

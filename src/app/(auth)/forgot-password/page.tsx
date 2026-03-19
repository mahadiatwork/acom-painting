"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1000);
  };

  return (
    <Layout className="bg-transparent">
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md app-soft-card px-7 py-10 md:px-8 md:py-12 relative">
          <Link href="/login" className="absolute left-6 top-6 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <ArrowLeft size={22} />
          </Link>

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
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Account Recovery</p>
            <h2 className="app-section-title text-[2.1rem]">Forgot Password?</h2>
            <p className="app-subtle-text mt-3 max-w-sm">
              Enter your email or username and we’ll send your password reset instructions.
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <InputField
                label="Email or Username"
                id="identifier"
                type="text"
                placeholder="Username or email address"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />

              <div className="pt-3">
                <PrimaryButton type="submit" disabled={loading} className="text-lg">
                  {loading ? "Sending..." : "Send Reset Link"}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="flex h-18 w-18 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner">
                <CheckCircle2 size={34} />
              </div>
              <h3 className="text-2xl font-semibold text-slate-800">Check your email</h3>
              <p className="app-subtle-text">
                We&apos;ve sent a password reset link to the email associated with your account.
              </p>
              <Link href="/login" className="w-full pt-4">
                <PrimaryButton variant="outline" className="w-full">
                  Back to Login
                </PrimaryButton>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

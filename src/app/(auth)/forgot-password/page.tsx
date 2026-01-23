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
    <Layout className="bg-white">
      <div className="flex flex-col min-h-screen">
        <div className="bg-secondary py-12 px-8 flex flex-col items-center justify-center relative">
          <Link href="/login" className="absolute top-6 left-6 text-gray-300 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div className="inline-flex items-center justify-center mb-6">
            <img
              src="/assets/acomLogo.png"
              alt="ACOM Painting Logo"
              width={160}
              height={96}
              className="h-24 w-auto"
            />
          </div>
          <div className="h-1 w-12 bg-primary rounded-full mb-2"></div>
          <p className="text-gray-400 text-xs font-medium tracking-widest uppercase">Account Recovery</p>
        </div>

        <div className="flex-1 p-8 pt-10 bg-white">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Forgot Password?</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Enter your username or email address below, and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <InputField
                label="Email or Username"
                id="identifier"
                type="text"
                placeholder="Username or email address"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="bg-gray-50 border-gray-200 focus:bg-white"
              />

              <div className="pt-4">
                <PrimaryButton type="submit" disabled={loading} className="h-14 text-lg">
                  {loading ? "Sending..." : "Send Reset Link"}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Check your email</h3>
              <p className="text-gray-500 text-sm">
                We&apos;ve sent a password reset link to the email associated with your account.
              </p>
              <Link href="/login" className="w-full mt-6">
                <PrimaryButton variant="outline" className="h-14 w-full">
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


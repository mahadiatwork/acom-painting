"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
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
        router.push("/");
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
    <Layout className="bg-white">
      <div className="flex flex-col min-h-screen">
        <div className="bg-secondary py-20 px-8 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center mb-6">
            <Image 
              src="/assets/image_1764793317196.png" 
              alt="Roof Worx Logo" 
              width={128} 
              height={128} 
              className="h-32 w-auto invert brightness-0 filter" 
            />
          </div>
          <div className="h-1 w-16 bg-primary rounded-full mb-2"></div>
          <p className="text-gray-400 text-sm font-medium tracking-widest uppercase">Field Time Entry</p>
        </div>
        
        <div className="flex-1 p-8 pt-10 bg-white">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back</h2>
            <p className="text-gray-500">Please sign in to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <InputField 
              label="Email" 
              id="identifier" 
              type="email" 
              placeholder="name@roofworx.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="bg-gray-50 border-gray-200 focus:bg-white"
            />
            
            <InputField 
              label="Password" 
              id="password" 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-gray-50 border-gray-200 focus:bg-white"
            />

            <div className="pt-4">
              <PrimaryButton type="submit" disabled={loading} className="h-14 text-lg">
                {loading ? "Logging in..." : "Login"}
              </PrimaryButton>
            </div>
            
            <div className="text-center mt-6">
              <Link href="/forgot-password">
                <span className="text-sm text-gray-400 hover:text-primary transition-colors cursor-pointer">
                  Forgot Password?
                </span>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
    <Layout className="bg-white">
      <div className="flex flex-col min-h-screen">
        <div className="bg-secondary py-12 px-8 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center mb-6">
            <Image 
              src="/assets/image_1764793317196.png" 
              alt="Roof Worx Logo" 
              width={96} 
              height={96} 
              className="h-24 w-auto invert brightness-0 filter" 
            />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Update Password</h2>
          <p className="text-gray-400 text-sm text-center">
            For your security, please set a new password before continuing.
          </p>
        </div>
        
        <div className="flex-1 p-8 pt-10 bg-white">
          <form onSubmit={handleUpdate} className="space-y-6">
            <InputField 
              label="New Password" 
              id="new-password" 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-gray-50 border-gray-200 focus:bg-white"
            />
            
            <InputField 
              label="Confirm Password" 
              id="confirm-password" 
              type="password" 
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="bg-gray-50 border-gray-200 focus:bg-white"
            />

            <div className="pt-4">
              <PrimaryButton type="submit" disabled={loading} className="h-14 text-lg">
                {loading ? "Updating..." : "Set Password & Login"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}


import React, { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import logoUrl from "@assets/image_1764793317196.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setLocation("/");
    }, 800);
  };

  return (
    <Layout className="bg-muted items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg overflow-hidden border border-border">
        <div className="bg-secondary p-8 text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <img src={logoUrl} alt="Roof Worx Logo" className="h-24 w-auto invert brightness-0 filter" />
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="p-6 space-y-6">
          <InputField 
            label="Email Address" 
            id="email" 
            type="email" 
            placeholder="you@roofworx.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

          <div className="pt-2">
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </Layout>
  );
}

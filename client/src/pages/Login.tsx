import React, { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField } from "@/components/FormFields";
import { Hammer } from "lucide-react";

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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-4 text-primary">
            <Hammer size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-2xl font-bold text-white tracking-wider">
            ROOF WORX
          </h1>
          <p className="text-gray-400 text-sm mt-1">Field Time Entry</p>
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

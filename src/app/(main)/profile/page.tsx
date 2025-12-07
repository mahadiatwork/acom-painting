"use client"

import React from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { currentUser } from "@/data/mockData";
import { Mail, Phone, Shield, LogOut } from "lucide-react";

export default function Profile() {
  const router = useRouter();

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <Layout>
      <div className="bg-secondary text-white p-4 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">My Profile</h1>
      </div>
      
      <main className="flex-1 p-4 pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="h-24 bg-primary/20 relative">
             <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-secondary rounded-full border-4 border-white flex items-center justify-center text-white">
               <span className="text-2xl font-bold">{currentUser.name.charAt(0)}</span>
             </div>
          </div>
          <div className="pt-12 pb-6 px-4 text-center">
            <h2 className="text-xl font-bold text-gray-800">{currentUser.name}</h2>
            <p className="text-gray-500 text-sm">{currentUser.role}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100 mb-8">
          <div className="p-4 flex items-center gap-4">
            <Mail className="text-gray-400" size={20} />
            <div>
              <p className="text-xs text-gray-400 uppercase">Email</p>
              <p className="text-gray-800 font-medium">{currentUser.email}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <Phone className="text-gray-400" size={20} />
            <div>
              <p className="text-xs text-gray-400 uppercase">Phone</p>
              <p className="text-gray-800 font-medium">(555) 123-4567</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <Shield className="text-gray-400" size={20} />
            <div>
              <p className="text-xs text-gray-400 uppercase">Employee ID</p>
              <p className="text-gray-800 font-medium">#8842</p>
            </div>
          </div>
        </div>

        <PrimaryButton 
          onClick={handleLogout} 
          variant="destructive" 
          className="w-full flex items-center justify-center gap-2"
        >
          <LogOut size={20} />
          Sign Out
        </PrimaryButton>
      </main>
    </Layout>
  );
}


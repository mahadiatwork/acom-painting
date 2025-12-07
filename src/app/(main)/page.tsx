"use client"

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layout, Header } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getRecentEntries, getWeeklyHours } from "@/data/mockData";
import { Plus, Clock, CalendarDays, ChevronRight, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

export default function Dashboard() {
  const router = useRouter();
  const recentEntries = getRecentEntries();
  const weeklyHours = getWeeklyHours();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const userName = user?.user_metadata?.name || user?.email || "User";

  return (
    <Layout>
      <Header user={loading ? "..." : userName} onLogout={handleLogout} />
      
      <main className="flex-1 p-4 space-y-6 overflow-y-auto pb-24">
        {/* Main Action */}
        <section>
          <Link href="/entry/new">
            <PrimaryButton className="h-16 text-lg shadow-lg flex items-center justify-center gap-2">
              <Plus size={24} strokeWidth={3} />
              New Time Entry
            </PrimaryButton>
          </Link>
        </section>

        {/* Quick Glance */}
        <section className="grid grid-cols-1 gap-4">
          <div className="bg-secondary text-white p-6 rounded-xl shadow-md flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Clock size={100} />
            </div>
            <h3 className="text-gray-300 text-sm font-medium uppercase tracking-wider mb-1">Hours This Week</h3>
            <span className="text-5xl font-bold font-heading">{weeklyHours}</span>
          </div>
        </section>

        {/* Recent History */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-lg font-bold text-gray-800">Recent Entries</h3>
            <Link href="/history" className="text-primary text-sm font-semibold flex items-center">
              View All <ChevronRight size={16} />
            </Link>
          </div>
          
          <div className="space-y-3">
            {recentEntries.map((entry) => (
              <div key={entry.id} className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-800 line-clamp-1">{entry.jobName}</h4>
                  <div className="flex items-center text-gray-500 text-xs mt-1 gap-2">
                    <span className="flex items-center gap-1"><CalendarDays size={12} /> {entry.date}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                    <span className="font-mono">{entry.totalHours} hrs</span>
                  </div>
                </div>
                <div className="text-green-600">
                  {entry.synced && <div className="bg-green-100 p-1 rounded-full"><History size={16} /></div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}

"use client"

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layout, Header } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Plus, Clock, CalendarDays, ChevronRight, History } from "lucide-react";
import { useRecentEntries } from "@/hooks/useTimeEntries";
import { useWeeklyHours } from "@/hooks/useWeeklyHours";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

export default function Dashboard() {
  const router = useRouter();
  const { data: rawRecentEntries, isLoading: isLoadingEntries, isError: isEntriesError } = useRecentEntries(2);
  // Ensure it is always an array before the UI touches it
  const recentEntries = Array.isArray(rawRecentEntries) ? rawRecentEntries : [];

  // Debug Log in Render
  console.log('[Dashboard Render] Raw entries:', rawRecentEntries);
  console.log('[Dashboard Render] Entries available:', recentEntries.length);
  console.log('[Dashboard Render] Is loading:', isLoadingEntries);

  const { data: weeklyHours = 0, isLoading: isLoadingHours, isError: isHoursError } = useWeeklyHours();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      }
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth state changes (session updates, login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
          // If session is lost, redirect to login
          if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
            router.push("/login");
          }
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (!error) {
      // Clear local state
      setUser(null);
      // Redirect to login
      router.push("/login");
      // Force a hard refresh to clear any cached data
      router.refresh();
    }
  };

  const userName = user?.user_metadata?.name || user?.email || "User";

  return (
    <Layout>
      <Header user={loading ? "..." : userName} onLogout={handleLogout} />

      <main className="flex-1 p-4 md:p-6 xl:p-4 space-y-6 overflow-y-auto pb-24 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
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
            {isLoadingHours ? (
              <div className="h-16 w-24 bg-white/20 rounded animate-pulse"></div>
            ) : (
              <span className="text-5xl font-bold font-heading">{weeklyHours}</span>
            )}
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
            {isLoadingEntries ? (
              // Skeleton loader - show for max 3 seconds
              <>
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : recentEntries.length === 0 ? (
              <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm text-center text-gray-500">
                No entries yet. Create your first time entry!
              </div>
            ) : (
              recentEntries.map((entry) => (
                <div 
                  key={entry.id} 
                  onClick={() => router.push(`/entry/${entry.id}`)}
                  className="bg-white p-4 rounded-lg border border-primary/30 border-l-4 border-l-primary shadow-sm flex justify-between items-center cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                >
                  <div>
                    <h4 className="font-bold text-gray-800 line-clamp-1">{entry.jobName}</h4>
                    <div className="flex items-center text-gray-500 text-xs mt-1 gap-2">
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {entry.date}</span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                      <span className="font-mono">{entry.totalHours} hrs</span>
                    </div>
                  </div>
                  <div className="text-primary">
                    {entry.synced && <div className="bg-primary/10 p-1 rounded-full"><History size={16} /></div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </Layout>
  );
}

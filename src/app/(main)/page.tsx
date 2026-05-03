"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Plus, Clock, CalendarDays, ChevronRight, History } from "lucide-react";
import { useRecentEntries } from "@/hooks/useTimeEntries";
import { useWeeklyHours } from "@/hooks/useWeeklyHours";
import { createClient } from "@/lib/supabase/client";
import { useSelectedForeman } from "@/contexts/SelectedForemanContext";
import { ForemanIndicatorBar } from "./ForemanIndicatorBar";
import { useNavigationLoading } from "@/contexts/NavigationLoadingContext";

export default function Dashboard() {
  const router = useRouter();
  const { startLoading } = useNavigationLoading();
  const { foreman, hydrated } = useSelectedForeman();
  const { data: rawRecentEntries, isLoading: isLoadingEntries, isError: isEntriesError } = useRecentEntries(2);
  const recentEntries = Array.isArray(rawRecentEntries) ? rawRecentEntries : [];
  const { data: weeklyHours = 0, isLoading: isLoadingHours, isError: isHoursError } = useWeeklyHours();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Logout] signOut error:", err);
      }
    } finally {
      window.location.replace("/login");
    }
  };

  const handleNewTimesheet = () => {
    startLoading("New Timesheet");
    router.push("/entry/new");
  };

  const handleViewAll = () => {
    startLoading("All Entries");
    router.push("/history");
  };

  const handleEntryClick = (id: string) => {
    startLoading("Timesheet Details");
    router.push(`/entry/${id}`);
  };

  return (
    <>
      <Header onLogout={handleLogout} logoutLoading={loggingOut} />
      <ForemanIndicatorBar />

      <main className="flex-1 w-full px-4 py-5 space-y-6 overflow-y-auto pb-32">

        {/* Main Action */}
        <section className="w-full pt-1">
          <PrimaryButton
            onClick={handleNewTimesheet}
            className="mt-4 w-full h-14 text-lg flex items-center justify-center gap-2 rounded-[1rem] shadow-md"
          >
            <Plus size={24} strokeWidth={3} />
            New Timesheet
          </PrimaryButton>
        </section>

        {/* Quick Glance */}
        <section className="w-full grid grid-cols-1 gap-4">
          <div className="w-full rounded-[1.25rem] bg-[linear-gradient(180deg,#384146_0%,#2f373c_100%)] text-white p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
            <div className="absolute top-3 right-3 p-3 opacity-10">
              <Clock size={100} />
            </div>
            <h3 className="text-white/70 text-xs font-medium uppercase tracking-[0.22em] mb-2">Crew Hours This Week</h3>
            {isLoadingHours ? (
              <div className="h-16 w-24 bg-white/20 rounded animate-pulse"></div>
            ) : (
              <span className="text-5xl font-bold font-heading tracking-[-0.04em]">{weeklyHours}</span>
            )}
          </div>
        </section>

        {/* Recent History */}
        <section className="w-full">
          <div className="flex items-center justify-between mb-3 w-full">
            <h3 className="font-heading text-lg font-bold text-gray-800">Recent Timesheets</h3>
            <button
              type="button"
              onClick={handleViewAll}
              className="text-primary text-sm font-semibold flex items-center hover:opacity-80 transition-opacity"
            >
              View All <ChevronRight size={16} />
            </button>
          </div>

          <div className="space-y-3 w-full">
            {isLoadingEntries ? (
              <>
                {[1, 2].map((i) => (
                  <div key={i} className="w-full bg-white p-4 rounded-lg border border-gray-100 shadow-sm animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : recentEntries.length === 0 ? (
              <div className="app-flat-card w-full p-6 text-center text-gray-500">
                No timesheets yet. Create your first timesheet!
              </div>
            ) : (
              recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => handleEntryClick(entry.id)}
                  className="app-flat-card w-full p-5 border-l-4 border-l-primary flex justify-between items-center cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                >
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800 line-clamp-1 tracking-[-0.02em]">{entry.jobName}</h4>
                    <div className="flex items-center text-slate-500 text-xs mt-2 gap-2">
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {entry.date}</span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                      <span className="font-mono">{entry.totalCrewHours ?? 0} hrs</span>
                      {parseFloat(entry.extraHours ?? '0') > 0 && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                          <span className="text-primary font-medium">+ {entry.extraHours} extra hrs</span>
                        </>
                      )}
                      {(entry.painters?.length ?? 0) > 0 && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                          <span>{(entry.painters?.length ?? 0)} painter{(entry.painters?.length ?? 0) === 1 ? "" : "s"}</span>
                        </>
                      )}
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
    </>
  );
}

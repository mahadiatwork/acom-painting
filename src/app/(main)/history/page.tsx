"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { useTimeEntries } from "@/hooks/useTimeEntries";
import { CalendarDays, Clock, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

export default function History() {
  const router = useRouter();

  // State for selected days filter (default to 7 days)
  const [selectedDays, setSelectedDays] = useState<7 | 30>(7);

  const { data: rawEntries, isLoading, isError } = useTimeEntries({ days: selectedDays });

  // Ensure it is always an array before the UI touches it
  const entries = Array.isArray(rawEntries) ? rawEntries : [];

  return (
    <Layout>
      <div className="app-topbar px-5 py-5 flex items-center sticky top-0 z-10">
        <button onClick={() => router.push("/")} className="mr-4 rounded-full p-2 text-white/70 hover:bg-white/8 hover:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">Time History</h1>
      </div>

      <main className="flex-1 p-4 md:p-6 xl:p-4 space-y-5 overflow-y-auto pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
        {/* Days Filter Toggle */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 italic">Showing last {selectedDays} days</p>
          <div className="app-flat-card flex rounded-2xl overflow-hidden p-1 border-none shadow-none">
            <button
              onClick={() => setSelectedDays(7)}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${selectedDays === 7
                ? "bg-primary text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-50"
                }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setSelectedDays(30)}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${selectedDays === 30
                ? "bg-primary text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-50"
                }`}
            >
              30 Days
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="app-soft-card p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
            <p className="text-gray-500">Loading entries...</p>
          </div>
        ) : isError ? (
          <div className="app-soft-card p-8 text-center">
            <p className="text-red-500">Failed to load entries. Please try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="app-soft-card p-8 text-center">
            <p className="text-gray-500">No timesheets found. Create your first timesheet!</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                onClick={() => router.push(`/entry/${entry.id}`)}
                className={`app-flat-card p-5 relative overflow-hidden cursor-pointer hover:shadow-md hover:border-primary/50 transition-all ${index === entries.length - 1 ? 'mb-4' : ''}`}
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>

                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-slate-800 text-lg leading-tight pr-8 tracking-[-0.02em]">{entry.jobName}</h3>
                  {entry.synced && (
                    <div className="flex items-center text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                      <CheckCircle2 size={12} className="mr-1" /> SYNCED
                    </div>
                  )}
                  {!entry.synced && (
                    <div className="flex items-center text-orange-600 text-xs font-bold bg-orange-50 px-2 py-1 rounded-full border border-orange-100">
                      PENDING
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Date</div>
                    <div className="flex items-center text-slate-700 font-medium">
                      <CalendarDays size={16} className="mr-2 text-primary" />
                      {entry.date}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Crew hours</div>
                    <div className="flex items-center text-slate-700 font-medium">
                      <Clock size={16} className="mr-2 text-primary" />
                      {entry.totalCrewHours ?? 0} hrs
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-sm text-slate-600">
                  {(entry.painters?.length ?? 0)} painter{(entry.painters?.length ?? 0) === 1 ? "" : "s"}
                </div>
                {entry.notes && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Notes</div>
                    <div className="text-sm text-slate-700">{entry.notes}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}



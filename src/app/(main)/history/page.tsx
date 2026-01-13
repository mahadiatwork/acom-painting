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

  // Debug Log in Render
  console.log('[History Render] Raw entries:', rawEntries);
  console.log('[History Render] Entries available:', entries.length);
  console.log('[History Render] Is loading:', isLoading);

  return (
    <Layout>
      <div className="bg-secondary text-secondary-foreground p-4 flex items-center sticky top-0 z-10 shadow-md">
        <button onClick={() => router.push("/")} className="mr-4 text-gray-300 hover:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold tracking-wide text-white">Time History</h1>
      </div>

      <main className="flex-1 p-4 md:p-6 xl:p-4 space-y-4 overflow-y-auto pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
        {/* Days Filter Toggle */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 italic">Showing last {selectedDays} days</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setSelectedDays(7)}
              className={`px-4 py-2 text-sm font-medium transition-all ${selectedDays === 7
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setSelectedDays(30)}
              className={`px-4 py-2 text-sm font-medium transition-all ${selectedDays === 30
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
            >
              30 Days
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
            <p className="text-gray-500">Loading entries...</p>
          </div>
        ) : isError ? (
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
            <p className="text-red-500">Failed to load entries. Please try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
            <p className="text-gray-500">No entries found. Create your first time entry!</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {entries.map((entry, index) => (
              <div key={entry.id} className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden ${index === entries.length - 1 ? 'mb-4' : ''}`}>
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>

                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg leading-tight pr-8">{entry.jobName}</h3>
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
                    <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Date</div>
                    <div className="flex items-center text-gray-700 font-medium">
                      <CalendarDays size={16} className="mr-2 text-primary" />
                      {entry.date}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Total Hours</div>
                    <div className="flex items-center text-gray-700 font-medium">
                      <Clock size={16} className="mr-2 text-primary" />
                      {entry.totalHours} hrs
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>Start: <span className="font-mono text-gray-900">{entry.startTime}</span></div>
                  <div>End: <span className="font-mono text-gray-900">{entry.endTime}</span></div>
                </div>
                {entry.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Notes</div>
                    <div className="text-sm text-gray-700">{entry.notes}</div>
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




import React from "react";
import { useLocation } from "wouter";
import { Layout, Header } from "@/components/Layout";
import { timeEntries } from "@/mockData";
import { CalendarDays, Clock, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function History() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="bg-secondary text-secondary-foreground p-4 flex items-center sticky top-0 z-10 shadow-md">
        <button onClick={() => setLocation("/")} className="mr-4 text-gray-300 hover:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold tracking-wide text-white">Time History</h1>
      </div>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        <p className="text-sm text-gray-500 italic mb-2">Showing last 7 days. Edits must be made in CRM.</p>
        
        {timeEntries.map((entry) => (
          <div key={entry.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-gray-800 text-lg leading-tight pr-8">{entry.jobName}</h3>
              {entry.synced && (
                <div className="flex items-center text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                  <CheckCircle2 size={12} className="mr-1" /> SYNCED
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
          </div>
        ))}
      </main>
    </Layout>
  );
}

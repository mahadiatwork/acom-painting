"use client"

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { Layout } from "@/components/Layout";
import { useTimeEntries } from "@/hooks/useTimeEntries";
import { 
  ArrowLeft, 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  Loader2,
  Package,
  FileText
} from "lucide-react";

// Map database field names to display names
const SUNDRY_ITEM_NAMES: Record<string, string> = {
  maskingPaperRoll: 'Masking Paper Roll',
  plasticRoll: 'Plastic Roll',
  puttySpackleTub: 'Putty/Spackle Tub',
  caulkTube: 'Caulk Tube',
  whiteTapeRoll: 'White Tape Roll',
  orangeTapeRoll: 'Orange Tape Roll',
  floorPaperRoll: 'Floor Paper Roll',
  tip: 'Tip',
  sandingSponge: 'Sanding Sponge',
  inchRollerCover18: '18" Roller Cover',
  inchRollerCover9: '9" Roller Cover',
  miniCover: 'Mini Cover',
  masks: 'Masks',
  brickTapeRoll: 'Brick Tape Roll',
};

export default function EntryDetail() {
  const router = useRouter();
  const params = useParams();
  const entryId = params.id as string;

  const { data: rawEntries, isLoading } = useTimeEntries({ days: 30 });
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  
  // Find the specific entry
  const entry = entries.find(e => e.id === entryId);

  // Get sundry items with quantity > 0
  const sundryItems = entry ? Object.entries(SUNDRY_ITEM_NAMES)
    .map(([key, name]) => {
      const quantity = parseInt(entry[key as keyof typeof entry] as string || '0', 10);
      return { name, quantity, key };
    })
    .filter(item => item.quantity > 0) : [];

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-secondary text-secondary-foreground p-4 flex items-center sticky top-0 z-10 shadow-md">
          <button onClick={() => router.back()} className="mr-4 text-gray-300 hover:text-white">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold tracking-wide text-white">Entry Details</h1>
        </div>
        <main className="flex-1 p-4 md:p-6 xl:p-4 overflow-y-auto pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
            <p className="text-gray-500">Loading entry...</p>
          </div>
        </main>
      </Layout>
    );
  }

  if (!entry) {
    return (
      <Layout>
        <div className="bg-secondary text-secondary-foreground p-4 flex items-center sticky top-0 z-10 shadow-md">
          <button onClick={() => router.back()} className="mr-4 text-gray-300 hover:text-white">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold tracking-wide text-white">Entry Details</h1>
        </div>
        <main className="flex-1 p-4 md:p-6 xl:p-4 overflow-y-auto pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
            <p className="text-gray-500">Entry not found.</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              Go Back
            </button>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="bg-secondary text-secondary-foreground p-4 flex items-center sticky top-0 z-10 shadow-md">
        <button onClick={() => router.back()} className="mr-4 text-gray-300 hover:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold tracking-wide text-white">Entry Details</h1>
      </div>

      <main className="flex-1 p-4 md:p-6 xl:p-4 space-y-6 overflow-y-auto pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
        {/* Job Information */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-800">{entry.jobName}</h2>
            {entry.synced ? (
              <div className="flex items-center text-green-600 text-xs font-bold bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                <CheckCircle2 size={14} className="mr-1.5" /> SYNCED
              </div>
            ) : (
              <div className="flex items-center text-orange-600 text-xs font-bold bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                PENDING SYNC
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="flex items-center text-gray-700">
              <CalendarDays size={18} className="mr-2 text-primary" />
              <div>
                <div className="text-xs text-gray-400 uppercase font-semibold">Date</div>
                <div className="font-medium">{entry.date}</div>
              </div>
            </div>
            <div className="flex items-center text-gray-700">
              <Clock size={18} className="mr-2 text-primary" />
              <div>
                <div className="text-xs text-gray-400 uppercase font-semibold">Total Hours</div>
                <div className="font-medium">{entry.totalHours} hrs</div>
              </div>
            </div>
          </div>
        </section>

        {/* Time Details */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Clock size={20} className="mr-2 text-primary" />
            Time Details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Start Time</div>
              <div className="text-gray-900 font-mono font-medium">{entry.startTime}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase font-semibold mb-1">End Time</div>
              <div className="text-gray-900 font-mono font-medium">{entry.endTime}</div>
            </div>
            {entry.lunchStart && entry.lunchEnd && (
              <>
                <div>
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Lunch Start</div>
                  <div className="text-gray-900 font-mono font-medium">{entry.lunchStart}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Lunch End</div>
                  <div className="text-gray-900 font-mono font-medium">{entry.lunchEnd}</div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Sundry Items */}
        {sundryItems.length > 0 && (
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <Package size={20} className="mr-2 text-primary" />
              Sundry Items Used
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sundryItems.map((item) => (
                <div
                  key={item.key}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <span className="text-gray-700 font-medium">{item.name}</span>
                  <span className="text-primary font-bold text-lg">{item.quantity}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Notes */}
        {entry.notes && (
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <FileText size={20} className="mr-2 text-primary" />
              Notes
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap">{entry.notes}</div>
          </section>
        )}

        {/* Additional Info */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Additional Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Entry ID:</span>
              <span className="text-gray-900 font-mono text-xs">{entry.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Job ID:</span>
              <span className="text-gray-900 font-mono text-xs">{entry.jobId}</span>
            </div>
            {entry.changeOrder && (
              <div className="flex justify-between">
                <span className="text-gray-500">Change Order:</span>
                <span className="text-gray-900">{entry.changeOrder}</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </Layout>
  );
}

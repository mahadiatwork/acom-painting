"use client"

import React from "react";
import { Layout } from "@/components/Layout";
import { BellRing, Info, AlertTriangle } from "lucide-react";

export default function Notices() {
  return (
    <Layout>
      <div className="app-topbar px-5 py-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">Notices</h1>
      </div>

      <main className="flex-1 p-4 space-y-4 pb-32">
        {[
          {
            title: "Weather Alert: Heavy Rain",
            date: "Today, 8:00 AM",
            priority: "high",
            icon: AlertTriangle,
            message: "Heavy rain expected this afternoon. Please secure all job sites by 2 PM."
          },
          {
            title: "Quarterly Safety Meeting",
            date: "Yesterday",
            priority: "normal",
            icon: BellRing,
            message: "Mandatory safety meeting this Friday at 7 AM in the main warehouse."
          },
          {
            title: "System Maintenance",
            date: "Oct 24",
            priority: "low",
            icon: Info,
            message: "Time entry system will be down for maintenance on Sunday night from 10 PM to 2 AM."
          },
        ].map((notice, i) => (
          <div key={i} className={`app-flat-card p-5 border-l-4 ${notice.priority === 'high' ? 'border-l-destructive border-y border-r border-gray-100' :
              notice.priority === 'normal' ? 'border-l-primary border-y border-r border-gray-100' :
                'border-l-gray-400 border-y border-r border-gray-100'
            }`}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <notice.icon size={18} className={
                  notice.priority === 'high' ? 'text-destructive' :
                    notice.priority === 'normal' ? 'text-primary' : 'text-gray-400'
                } />
                <h3 className="font-semibold text-slate-800 tracking-[-0.02em]">{notice.title}</h3>
              </div>
              <span className="text-xs text-slate-400">{notice.date}</span>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed pl-7">
              {notice.message}
            </p>
          </div>
        ))}
      </main>
    </Layout>
  );
}




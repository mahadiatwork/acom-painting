import React from "react";
import { Layout } from "@/components/Layout";
import { FileText, ShieldAlert, Wrench } from "lucide-react";

export default function Resources() {
  return (
    <Layout>
      <div className="bg-secondary text-white p-4 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Resources</h1>
      </div>
      
      <main className="flex-1 p-4 space-y-4 pb-24">
        <div className="grid gap-4">
          {[
            { title: "Safety Manual 2024", icon: ShieldAlert, type: "PDF" },
            { title: "Material Specs - Shingles", icon: FileText, type: "DOC" },
            { title: "Equipment Guide", icon: Wrench, type: "PDF" },
            { title: "HR Policies", icon: FileText, type: "PDF" },
          ].map((item, i) => (
            <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between active:bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                  <item.icon size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{item.title}</h3>
                  <span className="text-xs text-gray-400 font-mono">{item.type}</span>
                </div>
              </div>
              <div className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">
                VIEW
              </div>
            </div>
          ))}
        </div>
      </main>
    </Layout>
  );
}

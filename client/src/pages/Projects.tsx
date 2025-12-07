import React, { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { activeJobs } from "@/mockData";
import { Briefcase, MapPin, User, FileText, ChevronRight, ExternalLink, ArrowLeft } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";

export default function Projects() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const selectedJob = activeJobs.find(j => j.id === selectedJobId);

  if (selectedJob) {
    return (
      <Layout>
        <div className="bg-secondary text-white p-4 flex items-center sticky top-0 z-10 shadow-md">
          <button onClick={() => setSelectedJobId(null)} className="mr-4 text-gray-300 hover:text-white">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold tracking-wide text-white truncate pr-4">
            {selectedJob.name}
          </h1>
        </div>

        <main className="flex-1 p-4 pb-24 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Project Details</h2>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="text-primary mt-1 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Address</p>
                  <p className="text-gray-800 font-medium leading-relaxed">{selectedJob.address}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="text-primary mt-1 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Sales Rep</p>
                  <p className="text-gray-800 font-medium">{selectedJob.salesRep}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <FileText size={20} className="text-gray-600" /> Documents
              </h2>
            </div>
            <div className="p-6 text-center">
              <p className="text-gray-500 mb-6 text-sm">
                Access the full work order, material lists, and photos on Zoho WorkDrive.
              </p>
              
              <a 
                href={selectedJob.workOrderLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block"
              >
                <PrimaryButton className="w-full flex items-center justify-center gap-2">
                  Open Work Order <ExternalLink size={18} />
                </PrimaryButton>
              </a>
            </div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-secondary text-white p-4 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Projects</h1>
      </div>
      
      <main className="flex-1 p-4 space-y-3 pb-24">
        {activeJobs.map((job) => (
          <div 
            key={job.id} 
            onClick={() => setSelectedJobId(job.id)}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 active:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Briefcase size={18} className="text-primary shrink-0" />
                <h3 className="font-bold text-gray-800 leading-tight">{job.name}</h3>
              </div>
            </div>
            
            <div className="pl-6 space-y-1">
              <div className="flex items-center text-sm text-gray-600">
                <MapPin size={14} className="mr-2 text-gray-400" />
                {job.address}
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <User size={14} className="mr-2 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase mr-1">Rep:</span> {job.salesRep}
              </div>
            </div>
            
            <div className="mt-3 flex justify-end">
               <span className="text-primary text-xs font-bold flex items-center">
                 DETAILS <ChevronRight size={14} />
               </span>
            </div>
          </div>
        ))}
      </main>
    </Layout>
  );
}

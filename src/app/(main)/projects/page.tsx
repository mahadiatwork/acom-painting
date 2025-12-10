"use client"

import React, { useState } from "react";
import { Layout } from "@/components/Layout";
import { Briefcase, MapPin, User, FileText, ChevronRight, ExternalLink, ArrowLeft, Loader2, Info } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useProjects } from "@/hooks/useProjects";

export default function Projects() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { data: projects = [], isLoading, error } = useProjects();
  
  const selectedJob = projects?.find(j => j.id === selectedJobId);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-gray-500 text-sm">Loading projects...</p>
        </div>
      </Layout>
    );
  }

  // Show "no projects" if empty (after loading is done)
  if (!isLoading && (!projects || projects.length === 0)) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
          <Info className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">No projects found</p>
          <p className="text-gray-500 text-sm mb-4">Projects will appear here once they&apos;re assigned to you in Zoho CRM.</p>
          <button onClick={() => window.location.reload()} className="text-primary underline text-sm">Refresh</button>
        </div>
      </Layout>
    )
  }

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

        <main className="flex-1 p-4 md:p-6 xl:p-4 pb-24 space-y-6 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Project Details</h2>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="text-primary mt-1 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Address</p>
                  <p className="text-gray-800 font-medium leading-relaxed">{selectedJob.address || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="text-primary mt-1 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Sales Rep</p>
                  <p className="text-gray-800 font-medium">{selectedJob.salesRep || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* New Project Specs Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Info size={20} className="text-gray-600" /> Job Specs
              </h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Supplier Color</p>
                    <p className="text-gray-800 font-medium">{selectedJob.supplierColor || '-'}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Trim Color</p>
                    <p className="text-gray-800 font-medium">{selectedJob.trimColor || '-'}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Accessory Color</p>
                    <p className="text-gray-800 font-medium">{selectedJob.accessoryColor || '-'}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Gutter Type</p>
                    <p className="text-gray-800 font-medium">{selectedJob.gutterType || '-'}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Siding Style</p>
                    <p className="text-gray-800 font-medium">{selectedJob.sidingStyle || '-'}</p>
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
                href={selectedJob.workOrderLink || '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block"
              >
                <PrimaryButton className="w-full flex items-center justify-center gap-2" disabled={!selectedJob.workOrderLink}>
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
      
      <main className="flex-1 p-4 md:p-6 xl:p-4 space-y-3 pb-24 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
        {projects?.length === 0 && (
            <div className="text-center p-8 text-gray-500">
                <Briefcase size={48} className="mx-auto mb-4 opacity-20" />
                <p>No active projects found.</p>
                <p className="text-xs mt-2">Check back later or contact your admin.</p>
            </div>
        )}
        
        {projects?.map((job) => (
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
                {job.address || 'No Address'}
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <User size={14} className="mr-2 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase mr-1">Rep:</span> {job.salesRep || 'N/A'}
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

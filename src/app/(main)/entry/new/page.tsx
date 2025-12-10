"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField, TextAreaField } from "@/components/FormFields";
import { ArrowLeft, Save, Loader2, Calendar, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/hooks/useProjects";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function NewEntry() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data Fetching
  const { data: projects, isLoading: isLoadingProjects } = useProjects();

  // Form State
  const [jobId, setJobId] = useState("");
  const [date, setDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    return new Date().toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    // Validation
    if (!jobId) {
      toast({
        title: "Validation Error",
        description: "Please select a job",
        variant: "destructive",
      });
      return;
    }

    if (!startTime || !endTime) {
      toast({
        title: "Validation Error",
        description: "Please enter start and end times",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("User not authenticated");
      }

      // Calculate total hours
      const parseTime = (value: string) => {
        if (!value) return 0;
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };

      const totalMinutes = parseTime(endTime) - parseTime(startTime);
      const totalHours = totalMinutes > 0 ? Number((totalMinutes / 60).toFixed(2)) : 0;

      const submissionData = {
        jobId,
        jobName: projects?.find(j => j.id.toString() === jobId)?.name || "",
        date,
        startTime,
        endTime,
        lunchStart: "",
        lunchEnd: "",
        totalHours,
        notes: notes || "",
        changeOrder: "",
        userId: user.id,
      };

      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save entry");
      }

      // Invalidate React Query cache to trigger refetch
      // refetchType: 'active' ensures active queries refetch immediately
      queryClient.invalidateQueries({ 
        queryKey: ['time-entries'],
        refetchType: 'active' // Refetch active queries immediately
      });
      queryClient.invalidateQueries({ 
        queryKey: ['weeklyHours'],
        refetchType: 'active'
      });

      toast({
        title: "Entry Submitted",
        description: "Your time entry has been saved successfully.",
        duration: 3000,
      });

      // Navigate immediately - the dashboard will refetch due to:
      // 1. refetchOnMount: true in useTimeEntries hook
      // 2. Cache invalidation above
      router.push("/");
      
      // Force a router refresh to ensure fresh data is loaded
      router.refresh();
    } catch (error) {
      console.error("Failed to submit entry:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Unable to save the entry. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const isFormValid = jobId && startTime && endTime;

  return (
    <Layout>
      {/* Header */}
      <div className="bg-secondary text-white p-4 flex items-center sticky top-0 z-20 shadow-md">
        <button 
          onClick={() => router.push("/")} 
          className="mr-4 text-gray-300 hover:text-white p-1"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">New Time Entry</h1>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 pb-24 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          {/* Job Details Section */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Job Details</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="job" className="text-gray-700 font-semibold mb-2 block">
                  Job <span className="text-red-500">*</span>
                </Label>
                {isLoadingProjects ? (
                  <div className="flex items-center space-x-2 p-3 border rounded-md bg-gray-50 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading jobs...</span>
                  </div>
                ) : (
                  <select 
                    id="job"
                    className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                  >
                    <option value="" disabled>Select a job</option>
                    {projects?.map(job => (
                      <option key={job.id} value={job.id}>{job.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <Label htmlFor="date" className="text-gray-700 font-semibold mb-2 block">
                  Date <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-12 px-3 pr-10 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none cursor-pointer hover:border-gray-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('date') as HTMLInputElement;
                      if (input?.showPicker) {
                        input.showPicker();
                      } else {
                        input?.focus();
                        input?.click();
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    <Calendar size={20} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Time Details Section */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Time Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-time" className="text-gray-700 font-semibold mb-2 block">
                  Start Time <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-12 px-3 pr-10 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none cursor-pointer hover:border-gray-400 transition-colors [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('start-time') as HTMLInputElement;
                      if (input?.showPicker) {
                        input.showPicker();
                      } else {
                        input?.focus();
                        input?.click();
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-10"
                  >
                    <Clock size={20} />
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="end-time" className="text-gray-700 font-semibold mb-2 block">
                  End Time <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-12 px-3 pr-10 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none cursor-pointer hover:border-gray-400 transition-colors [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('end-time') as HTMLInputElement;
                      if (input?.showPicker) {
                        input.showPicker();
                      } else {
                        input?.focus();
                        input?.click();
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-10"
                  >
                    <Clock size={20} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Additional Information Section */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Additional Information</h2>
            <div className="space-y-4">
              <div>
                <TextAreaField
                  id="notes"
                  label="Notes"
                  placeholder="Add any notes about the work performed..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full"
                />
              </div>
            </div>
          </section>

          {/* Action Buttons - Inside scrollable content */}
          <section className="pt-4 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push("/")}
                disabled={isSubmitting}
                className="flex-1 h-12 px-4 rounded-md border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <PrimaryButton
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                className="flex-1 text-lg shadow-md cursor-pointer hover:shadow-lg hover:bg-primary/85 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="mr-2" size={20} />
                    Submit Entry
                  </>
                )}
              </PrimaryButton>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}

"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextAreaField } from "@/components/FormFields";
import { ArrowLeft, Save, Loader2, Calendar, Clock, Package, Plus, Minus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/hooks/useProjects";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// Tab type
type TabType = "time-entry" | "sundry-entry";

// Sundry item interface
interface SundryItem {
  sundryItem: string;
  quantity: number;
}

// Sundry items list
const SUNDRY_ITEMS = [
  "Masking Paper Roll",
  "Plastic Roll",
  "Putty/Spackle Tub",
  "Caulk Tube",
  "White Tape Roll",
  "Orange Tape Roll",
  "Floor Paper Roll",
  "Tip",
  "Sanding Sponge",
  '18" Roller Cover',
  '9" Roller Cover',
  "Mini Cover",
  "Masks",
  "Brick Tape Roll",
];

export default function NewEntry() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<TabType>("time-entry");

  // Sundry Entry State - only items with quantity > 0 will be stored
  const [sundryItems, setSundryItems] = useState<SundryItem[]>([]);

  // Data Fetching
  const { data: projects, isLoading: isLoadingProjects } = useProjects();

  // Time Entry Form State
  const [jobId, setJobId] = useState("");
  const [date, setDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    return new Date().toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");
  const [notes, setNotes] = useState("");

  // Get quantity of a sundry item
  const getItemQuantity = (itemName: string): number => {
    const item = sundryItems.find(i => i.sundryItem === itemName);
    return item ? item.quantity : 0;
  };

  // Handle increment of sundry item
  const handleIncrement = (itemName: string) => {
    setSundryItems(prev => {
      const existingIndex = prev.findIndex(i => i.sundryItem === itemName);
      let newItems: SundryItem[];

      if (existingIndex >= 0) {
        // Item exists, increment quantity
        newItems = prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        // Item doesn't exist, add new item with quantity 1
        newItems = [...prev, { sundryItem: itemName, quantity: 1 }];
      }

      // Log state to console
      console.log("=== SUNDRY ITEMS STATE ===");
      console.log("Sundry Items:", newItems);
      console.log("===========================");

      return newItems;
    });
  };

  // Handle decrement of sundry item
  const handleDecrement = (itemName: string) => {
    setSundryItems(prev => {
      const existingIndex = prev.findIndex(i => i.sundryItem === itemName);

      if (existingIndex < 0) return prev; // Item doesn't exist

      const currentQuantity = prev[existingIndex].quantity;
      let newItems: SundryItem[];

      if (currentQuantity <= 1) {
        // Remove item from array if quantity becomes 0
        newItems = prev.filter((_, index) => index !== existingIndex);
      } else {
        // Decrement quantity
        newItems = prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }

      // Log state to console
      console.log("=== SUNDRY ITEMS STATE ===");
      console.log("Sundry Items:", newItems);
      console.log("===========================");

      return newItems;
    });
  };

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

      // Calculate work minutes
      let totalMinutes = parseTime(endTime) - parseTime(startTime);

      // Subtract lunch break if both lunch times are provided
      if (lunchStart && lunchEnd) {
        const lunchMinutes = parseTime(lunchEnd) - parseTime(lunchStart);
        if (lunchMinutes > 0) {
          totalMinutes -= lunchMinutes;
        }
      }

      const totalHours = totalMinutes > 0 ? Number((totalMinutes / 60).toFixed(2)) : 0;

      const submissionData = {
        jobId,
        jobName: projects?.find(j => j.id.toString() === jobId)?.name || "",
        date,
        startTime,
        endTime,
        lunchStart: lunchStart || "",
        lunchEnd: lunchEnd || "",
        totalHours,
        notes: notes || "",
        changeOrder: "",
        userId: user.id,
        sundryItems: sundryItems.filter(item => item.quantity > 0), // Only send items with quantity > 0
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
        <h1 className="text-lg font-bold">New Entry</h1>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-[60px] z-10">
        <div className="max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          <div className="flex">
            <button
              onClick={() => setActiveTab("time-entry")}
              className={`flex-1 py-3 px-4 text-center font-semibold text-sm transition-all relative ${activeTab === "time-entry"
                ? "text-primary"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock size={18} />
                Time Entry
              </div>
              {activeTab === "time-entry" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("sundry-entry")}
              className={`flex-1 py-3 px-4 text-center font-semibold text-sm transition-all relative ${activeTab === "sundry-entry"
                ? "text-primary"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Package size={18} />
                Sundry Entry
              </div>
              {activeTab === "sundry-entry" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">

          {/* Time Entry Tab Content */}
          {activeTab === "time-entry" && (
            <>
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

                  <div>
                    <Label htmlFor="lunch-start" className="text-gray-700 font-semibold mb-2 block">
                      Lunch Start
                    </Label>
                    <div className="relative">
                      <input
                        id="lunch-start"
                        type="time"
                        value={lunchStart}
                        onChange={(e) => setLunchStart(e.target.value)}
                        className="w-full h-12 px-3 pr-10 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none cursor-pointer hover:border-gray-400 transition-colors [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('lunch-start') as HTMLInputElement;
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
                    <Label htmlFor="lunch-end" className="text-gray-700 font-semibold mb-2 block">
                      Lunch End
                    </Label>
                    <div className="relative">
                      <input
                        id="lunch-end"
                        type="time"
                        value={lunchEnd}
                        onChange={(e) => setLunchEnd(e.target.value)}
                        className="w-full h-12 px-3 pr-10 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none cursor-pointer hover:border-gray-400 transition-colors [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('lunch-end') as HTMLInputElement;
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

              {/* Action Buttons - Time Entry */}
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
            </>
          )}

          {/* Sundry Entry Tab Content */}
          {activeTab === "sundry-entry" && (
            <>
              {/* Sundry Items Section */}
              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-4">Sundry Used Today</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Use the + and - buttons to track the quantity of each sundry item used today.
                </p>
                <div className="space-y-3">
                  {SUNDRY_ITEMS.map((itemName) => {
                    const quantity = getItemQuantity(itemName);
                    return (
                      <div
                        key={itemName}
                        className={`flex items-center justify-between p-4 rounded-lg border transition-all ${quantity > 0
                          ? "bg-primary/5 border-primary/30"
                          : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                      >
                        <span className={`font-medium ${quantity > 0 ? "text-primary" : "text-gray-700"}`}>
                          {itemName}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleDecrement(itemName)}
                            disabled={quantity === 0}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${quantity > 0
                              ? "bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
                              : "bg-gray-50 text-gray-300 cursor-not-allowed"
                              }`}
                          >
                            <Minus size={18} />
                          </button>
                          <span
                            className={`w-8 text-center font-bold text-lg ${quantity > 0 ? "text-primary" : "text-gray-400"
                              }`}
                          >
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncrement(itemName)}
                            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-all cursor-pointer shadow-md hover:shadow-lg"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Action Buttons - Sundry Entry */}
              <section className="pt-4 border-t border-gray-200 mb-20">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => router.push("/")}
                    className="flex-1 h-12 px-4 rounded-md border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <PrimaryButton
                    onClick={() => {
                      // Log current sundry items data to console
                      console.log("=== SUNDRY ENTRY FORM SUBMISSION ===");
                      console.log("Sundry Items:", sundryItems);
                      console.log("Total Items with quantity > 0:", sundryItems.length);
                      console.log("====================================");

                      toast({
                        title: "Sundry Data Logged",
                        description: `${sundryItems.length} sundry item(s) recorded. Check the browser console for details.`,
                        duration: 3000,
                      });
                    }}
                    disabled={sundryItems.length === 0}
                    className="flex-1 text-lg shadow-md cursor-pointer hover:shadow-lg hover:bg-primary/85 transition-all"
                  >
                    <Save className="mr-2" size={20} />
                    Save Sundry Items
                  </PrimaryButton>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </Layout>
  );
}

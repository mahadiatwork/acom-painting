"use client"

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { InputField, TextAreaField } from "@/components/FormFields";
import { activeJobs, currentUser } from "@/data/mockData";
import { ArrowLeft, HardHat, Check, ChevronRight, Save } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const STEPS = ["Job & Safety", "Time & Details", "Review"];

export default function NewEntry() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [jobId, setJobId] = useState("");
  const [safetyChecks, setSafetyChecks] = useState({
    ppe: false,
    ladder: false,
    hazards: false
  });
  
  const [timeData, setTimeData] = useState({
    startTime: "",
    lunchStart: "",
    lunchEnd: "",
    endTime: "",
  });
  
  const [notes, setNotes] = useState("");
  const [hasChangeOrder, setHasChangeOrder] = useState(false);
  const [changeOrderDetails, setChangeOrderDetails] = useState("");

  const handleNext = () => {
    setStep(s => Math.min(s + 1, 3));
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    if (step === 1) {
      router.push("/");
    } else {
      setStep(s => s - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const submissionData = {
      jobId,
      jobName: activeJobs.find(j => j.id.toString() === jobId)?.name,
      safetyChecks,
      ...timeData,
      notes,
      changeOrder: hasChangeOrder ? changeOrderDetails : null,
      status: "pending",
      userId: currentUser.id,
      totalHours: 0,
    };

    const parseTime = (value: string) => {
      const [h, m] = value.split(":").map(Number);
      return h * 60 + m;
    };

    const totalMinutes = parseTime(timeData.endTime) - parseTime(timeData.startTime);
    submissionData.totalHours = totalMinutes > 0 ? totalMinutes / 60 : 0;

    try {
      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        throw new Error("Failed to save entry");
      }

      toast({
        title: "Entry Submitted",
        description: "Your time entry was saved. We'll keep it in Supabase.",
        duration: 3000,
      });

      setTimeout(() => {
        router.push("/");
      }, 500);
    } catch (error) {
      console.error("Failed to submit entry:", error);
      toast({
        title: "Submission Failed",
        description: "Unable to save the entry. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const isStep1Valid = jobId && Object.values(safetyChecks).every(v => v);
  const isStep2Valid = timeData.startTime && timeData.endTime; // Simplified validation

  return (
    <Layout>
      {/* Header */}
      <div className="bg-secondary text-white p-4 flex items-center sticky top-0 z-20 shadow-md">
        <button onClick={handleBack} className="mr-4 text-gray-300 hover:text-white p-1">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-bold">New Time Entry</h1>
          <div className="flex gap-1 mt-1">
            {STEPS.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1 w-8 rounded-full ${step > idx ? 'bg-primary' : 'bg-gray-600'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 p-4 pb-24">
        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right duration-300">
            <section>
              <h2 className="text-xl font-heading font-bold text-secondary mb-4 flex items-center">
                <span className="bg-secondary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">1</span>
                Select Job
              </h2>
              <div className="space-y-2">
                <Label className="text-gray-500 font-semibold">Active Job</Label>
                <select 
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  <option value="" disabled>Select a job...</option>
                  {activeJobs.map(job => (
                    <option key={job.id} value={job.id}>{job.name}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="bg-orange-50 p-5 rounded-xl border border-orange-100">
              <h2 className="text-lg font-heading font-bold text-orange-800 mb-4 flex items-center">
                <HardHat className="mr-2" size={20} />
                Safety Checklist
              </h2>
              <div className="space-y-4">
                {[
                  { id: 'ppe', label: 'PPE Checked & Worn' },
                  { id: 'ladder', label: 'Ladder Secured / Scaffolding Safe' },
                  { id: 'hazards', label: 'Site Hazards Assessed' }
                ].map(check => (
                  <label key={check.id} className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-orange-100 shadow-sm active:scale-[0.99] transition-transform">
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 text-primary border-gray-300 rounded focus:ring-primary"
                      checked={safetyChecks[check.id as keyof typeof safetyChecks]}
                      onChange={(e) => setSafetyChecks(prev => ({ ...prev, [check.id]: e.target.checked }))}
                    />
                    <span className="text-gray-700 font-medium">{check.label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <section>
              <h2 className="text-xl font-heading font-bold text-secondary mb-4 flex items-center">
                <span className="bg-secondary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">2</span>
                Time & Details
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <InputField 
                  label="Start Time" 
                  type="time" 
                  id="start-time"
                  value={timeData.startTime}
                  onChange={(e) => setTimeData(prev => ({ ...prev, startTime: e.target.value }))}
                />
                <InputField 
                  label="End Time" 
                  type="time" 
                  id="end-time"
                  value={timeData.endTime}
                  onChange={(e) => setTimeData(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <InputField 
                  label="Lunch Start" 
                  type="time" 
                  id="lunch-start"
                  value={timeData.lunchStart}
                  onChange={(e) => setTimeData(prev => ({ ...prev, lunchStart: e.target.value }))}
                />
                <InputField 
                  label="Lunch End" 
                  type="time" 
                  id="lunch-end"
                  value={timeData.lunchEnd}
                  onChange={(e) => setTimeData(prev => ({ ...prev, lunchEnd: e.target.value }))}
                />
              </div>

              <TextAreaField 
                label="Daily Notes" 
                placeholder="What was accomplished today?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>

            <section className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <Label htmlFor="change-order" className="text-base font-bold text-gray-800">
                  Add Change Order / Extra Items?
                </Label>
                <Switch 
                  id="change-order" 
                  checked={hasChangeOrder}
                  onCheckedChange={setHasChangeOrder}
                />
              </div>
              
              {hasChangeOrder && (
                <div className="animate-in slide-in-from-top fade-in duration-200">
                   <TextAreaField 
                    label="Materials & Labor Details" 
                    placeholder="Describe extra materials used and labor time..."
                    className="bg-yellow-50 border-yellow-200 focus:border-yellow-400 focus:ring-yellow-400"
                    value={changeOrderDetails}
                    onChange={(e) => setChangeOrderDetails(e.target.value)}
                  />
                </div>
              )}
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
             <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check size={32} />
                </div>
                <h2 className="text-2xl font-heading font-bold text-gray-800 mb-2">Ready to Submit?</h2>
                <p className="text-gray-500 mb-6">Please review your entry before sending to the office.</p>
                
                <div className="text-left bg-gray-50 p-4 rounded-lg space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Job</span>
                    <span className="font-bold text-gray-800 text-right w-1/2 truncate">
                      {activeJobs.find(j => j.id.toString() === jobId)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Shift</span>
                    <span className="font-bold text-gray-800">{timeData.startTime} - {timeData.endTime}</span>
                  </div>
                   <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Lunch</span>
                    <span className="font-bold text-gray-800">{timeData.lunchStart} - {timeData.lunchEnd}</span>
                  </div>
                  {hasChangeOrder && (
                    <div className="flex justify-between text-orange-600 font-medium">
                      <span>Change Order</span>
                      <span>Yes</span>
                    </div>
                  )}
                </div>
             </section>
          </div>
        )}
      </main>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-center z-40">
        <div className="w-full max-w-md flex gap-3">
          {step < 3 ? (
             <div className="w-full">
               <PrimaryButton 
                 onClick={handleNext} 
                 disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                 className="w-full text-lg shadow-lg"
               >
                 Next Step <ChevronRight className="ml-2" />
               </PrimaryButton>
               
               {step === 1 && !isStep1Valid && (
                 <p className="text-center text-xs text-orange-600 mt-2 font-medium animate-pulse">
                   * Select a job & check all safety boxes to proceed
                 </p>
               )}
               
               {step === 2 && !isStep2Valid && (
                 <p className="text-center text-xs text-orange-600 mt-2 font-medium animate-pulse">
                   * Enter start and end times to proceed
                 </p>
               )}
             </div>
          ) : (
             <PrimaryButton 
               onClick={handleSubmit}
               disabled={isSubmitting}
               className="w-full text-lg shadow-lg bg-green-600 hover:bg-green-700"
             >
               {isSubmitting ? "Sending..." : "Submit to Office"}
               {!isSubmitting && <Save className="ml-2" size={20} />}
             </PrimaryButton>
          )}
        </div>
      </div>
    </Layout>
  );
}

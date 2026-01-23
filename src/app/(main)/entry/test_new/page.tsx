"use client"

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Package, Eye, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserTimezoneOffset } from "@/lib/timezone";

export default function TestZohoSync() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [zohoPayload, setZohoPayload] = useState<any>(null);
  const [loadingZohoId, setLoadingZohoId] = useState(true);
  const [zohoIdError, setZohoIdError] = useState<string | null>(null);

  // Form state
  const [projectId, setProjectId] = useState("6838013000000977057");
  const [contractorId, setContractorId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [lunchStart, setLunchStart] = useState("12:00");
  const [lunchEnd, setLunchEnd] = useState("13:00");
  const [totalHours, setTotalHours] = useState("8.00");
  const [notes, setNotes] = useState("Test entry from UI");

  // Sundry items state
  const [sundryItems, setSundryItems] = useState({
    Masking_Paper_Roll: 0,
    Plastic_Roll: 0,
    Putty_Spackle_Tub: 0,
    Caulk_Tube: 0,
    White_Tape_Roll: 0,
    Orange_Tape_Roll: 0,
    Floor_Paper_Roll: 0,
    Tip: 0,
    Sanding_Sponge: 0,
    Inch_Roller_Cover1: 0, // 18" Roller Cover
    Inch_Roller_Cover: 0,  // 9" Roller Cover
    Mini_Cover: 0,
    Masks: 0,
    Brick_Tape_Roll: 0,
  });

  // Fetch user's zoho_id from Supabase on component mount
  useEffect(() => {
    const fetchZohoId = async () => {
      try {
        setLoadingZohoId(true);
        setZohoIdError(null);
        
        const response = await fetch("/api/user/zoho-id");
        const data = await response.json();
        
        if (!response.ok) {
          setZohoIdError(data.message || data.error || "Failed to fetch Zoho ID");
          toast({
            title: "Warning",
            description: data.message || "Could not fetch your Zoho ID. Please enter it manually.",
            variant: "destructive",
          });
        } else if (data.zohoId) {
          setContractorId(data.zohoId);
          console.log(`[Test UI] Loaded Zoho ID from Supabase: ${data.zohoId} for ${data.email}`);
        }
      } catch (error) {
        console.error("[Test UI] Failed to fetch zoho_id:", error);
        setZohoIdError("Failed to fetch Zoho ID. Please enter it manually.");
        toast({
          title: "Error",
          description: "Could not fetch your Zoho ID. Please enter it manually.",
          variant: "destructive",
        });
      } finally {
        setLoadingZohoId(false);
      }
    };

    fetchZohoId();
  }, [toast]);

  const handleSundryChange = (key: string, value: number) => {
    setSundryItems(prev => ({
      ...prev,
      [key]: Math.max(0, value),
    }));
  };

  // Build Zoho payload preview (same format as zoho.ts)
  const buildZohoPayload = () => {
    const timezone = getUserTimezoneOffset();
    
    // Format DateTime helper (same as zoho.ts)
    const formatZohoDateTime = (date: string, time: string, tz: string): string => {
      let normalizedTime = time.trim();
      const isPM = normalizedTime.toUpperCase().includes('PM');
      const isAM = normalizedTime.toUpperCase().includes('AM');
      
      if (isPM || isAM) {
        normalizedTime = normalizedTime.replace(/[AaPp][Mm]/g, '').trim();
        const [hours, minutes] = normalizedTime.split(':').map(Number);
        
        if (isPM && hours !== 12) {
          normalizedTime = `${String(hours + 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else if (isAM && hours === 12) {
          normalizedTime = `00:${String(minutes).padStart(2, '0')}`;
        } else {
          normalizedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
      }
      
      return `${date}T${normalizedTime}:00${tz}`;
    };

    const startDateTime = formatZohoDateTime(date, startTime, timezone);
    const endDateTime = formatZohoDateTime(date, endTime, timezone);
    const entryName = `Time Entry - ${date} ${startTime} to ${endTime}`;

    // Build sundry items object (only include items with quantity > 0)
    const activeSundryItems: Record<string, number> = {};
    Object.entries(sundryItems).forEach(([key, value]) => {
      if (value > 0) {
        activeSundryItems[key] = value;
      }
    });

    const payload: Record<string, any> = {
      Name: entryName,
      Job: { id: projectId },                    // Lookup field (Deal ID) - object format
      Portal_User: { id: contractorId },         // Lookup field (Portal User ID) - object format
      Date: date,                                // Date field (YYYY-MM-DD)
      Start_Time: startDateTime,                 // DateTime with timezone
      End_Time: endDateTime,                     // DateTime with timezone
      Total_Hours: totalHours,                   // Single Line
      Time_Entry_Note: notes || '',              // Multi Line (Large)
    };

    // Add lunch times if provided
    if (lunchStart && lunchEnd) {
      payload.Lunch_Start = formatZohoDateTime(date, lunchStart, timezone);
      payload.Lunch_End = formatZohoDateTime(date, lunchEnd, timezone);
    }

    // Add sundry items (only if quantity > 0)
    Object.entries(activeSundryItems).forEach(([apiName, quantity]) => {
      if (quantity > 0) {
        payload[apiName] = quantity;
      }
    });

    return payload;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setResult(null);

    try {
      // Build sundry items object (only include items with quantity > 0)
      const activeSundryItems: Record<string, number> = {};
      Object.entries(sundryItems).forEach(([key, value]) => {
        if (value > 0) {
          activeSundryItems[key] = value;
        }
      });

      // Build and display Zoho payload
      const payload = buildZohoPayload();
      setZohoPayload(payload);

      const testData = {
        projectId,
        contractorId,
        date,
        startTime,
        endTime,
        lunchStart,
        lunchEnd,
        totalHours,
        notes,
        sundryItems: Object.keys(activeSundryItems).length > 0 ? activeSundryItems : undefined,
      };

      console.log('[Test UI] Sending test data:', testData);
      console.log('[Test UI] Zoho payload that will be sent:', JSON.stringify(payload, null, 2));

      const response = await fetch("/api/test/zoho-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testData),
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        toast({
          title: "Success!",
          description: `Test entry created in Zoho CRM. Entry ID: ${data.zohoResponse?.id || 'N/A'}`,
          duration: 5000,
        });
      } else {
        toast({
          title: "Test Failed",
          description: data.error || "Failed to create entry in Zoho",
          variant: "destructive",
          duration: 10000,
        });
      }
    } catch (error) {
      console.error("Test failed:", error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      toast({
        title: "Request Failed",
        description: "Failed to send test request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <h1 className="text-lg font-bold">Test Zoho Sync</h1>
      </div>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
          
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Test Mode:</strong> This form sends data directly to Zoho CRM, bypassing Supabase.
              Use this to debug Zoho integration issues.
            </p>
          </div>

          {/* Basic Information */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Project ID (Deal ID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="6838013000000977057"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contractor ID (Portal User ID) <span className="text-red-500">*</span>
                  {loadingZohoId && (
                    <span className="ml-2 text-xs text-gray-500">(Loading from Supabase...)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder={loadingZohoId ? "Loading..." : "6838013000000977001"}
                  disabled={loadingZohoId}
                />
                {zohoIdError && (
                  <div className="mt-2 flex items-center text-sm text-amber-600">
                    <AlertCircle size={16} className="mr-1" />
                    <span>{zohoIdError}</span>
                  </div>
                )}
                {!loadingZohoId && contractorId && (
                  <p className="mt-1 text-xs text-green-600">
                    ✓ Loaded from Supabase users table
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>
          </section>

          {/* Time Details */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Time Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Lunch Start
                </label>
                <input
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Lunch End
                </label>
                <input
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => setLunchEnd(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Total Hours
                </label>
                <input
                  type="text"
                  value={totalHours}
                  onChange={(e) => setTotalHours(e.target.value)}
                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="8.00"
                />
              </div>
            </div>
          </section>

          {/* Sundry Items */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <Package size={20} className="mr-2 text-primary" />
              Sundry Items (Zoho API Names)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(sundryItems).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <label className="text-sm text-gray-700 font-medium flex-1">{key}</label>
                  <input
                    type="number"
                    min="0"
                    value={value}
                    onChange={(e) => handleSundryChange(key, parseInt(e.target.value) || 0)}
                    className="w-20 h-10 px-2 rounded-md border border-gray-300 bg-white text-center focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="Test entry notes..."
            />
          </section>

          {/* Submit Button */}
          <section className="pt-4 pb-6 border-t border-gray-200">
            <PrimaryButton
              onClick={handleSubmit}
              disabled={isSubmitting || !projectId || !contractorId || !startTime || !endTime}
              className="w-full text-lg shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Testing Zoho Sync...
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-5 w-5" />
                  Show Payload & Test Zoho Sync
                </>
              )}
            </PrimaryButton>
          </section>

          {/* Zoho Payload Preview */}
          {zohoPayload && (
            <section className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6 shadow-sm">
              <div className="flex items-center mb-4">
                <Eye className="text-yellow-700 mr-2" size={24} />
                <h2 className="text-lg font-bold text-yellow-800">Zoho Payload (What will be sent to Zoho CRM)</h2>
              </div>
              <div className="bg-white rounded-lg p-4 border border-yellow-200 overflow-x-auto">
                <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono">
                  {JSON.stringify(zohoPayload, null, 2)}
                </pre>
              </div>
              <p className="text-xs text-yellow-700 mt-3">
                <strong>Note:</strong> This is the exact payload that will be sent to Zoho CRM API. 
                Lookup fields (<code className="bg-yellow-100 px-1 rounded">Job</code> and <code className="bg-yellow-100 px-1 rounded">Portal_User</code>) are formatted as objects with <code className="bg-yellow-100 px-1 rounded">id</code> property.
              </p>
            </section>
          )}

          {/* Results */}
          {result && (
            <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                {result.success ? (
                  <>
                    <CheckCircle2 className="text-green-600 mr-2" size={24} />
                    <h2 className="text-lg font-bold text-green-600">Test Successful!</h2>
                  </>
                ) : (
                  <>
                    <XCircle className="text-red-600 mr-2" size={24} />
                    <h2 className="text-lg font-bold text-red-600">Test Failed</h2>
                  </>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>

              {result.success && result.zohoResponse?.id && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <strong>Zoho Entry ID:</strong> {result.zohoResponse.id}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Check Zoho CRM → Time Entries module to see the entry.
                  </p>
                </div>
              )}

              {!result.success && result.details?.response?.data && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-semibold text-red-800 mb-2">Zoho API Error:</p>
                  <pre className="text-xs text-red-700 whitespace-pre-wrap">
                    {JSON.stringify(result.details.response.data, null, 2)}
                  </pre>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </Layout>
  );
}

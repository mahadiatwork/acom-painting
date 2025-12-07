// Mock Data for Roof Worx Application

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const currentUser: User = {
  id: 1,
  name: "John D.",
  email: "john.d@roofworx.com",
  role: "Field Foreman"
};

export interface Job {
  id: number;
  name: string;
  address: string;
  salesRep: string;
  workOrderLink: string;
}

export const activeJobs: Job[] = [
  { 
    id: 101, 
    name: "Smith Residence - Roof Replacement", 
    address: "123 Maple Ave",
    salesRep: "Mike T.",
    workOrderLink: "https://workdrive.zoho.com/folder/mock-link-101"
  },
  { 
    id: 102, 
    name: "Commercial Center - Repair", 
    address: "4500 Business Park Blvd",
    salesRep: "Sarah L.",
    workOrderLink: "https://workdrive.zoho.com/folder/mock-link-102"
  },
  { 
    id: 103, 
    name: "Johnson Gutter Install", 
    address: "89 Oak Lane",
    salesRep: "Mike T.",
    workOrderLink: "https://workdrive.zoho.com/folder/mock-link-103"
  },
  { 
    id: 104, 
    name: "Westview Apartments - Inspection", 
    address: "200 Westview Dr",
    salesRep: "David R.",
    workOrderLink: "https://workdrive.zoho.com/folder/mock-link-104"
  }
];

export interface TimeEntry {
  id: number;
  jobId: number;
  jobName: string;
  date: string;
  startTime: string;
  endTime: string;
  lunchStart: string;
  lunchEnd: string;
  totalHours: number;
  synced: boolean;
  notes: string;
}

export const timeEntries: TimeEntry[] = [
  {
    id: 501,
    jobId: 101,
    jobName: "Smith Residence - Roof Replacement",
    date: "2023-10-26",
    startTime: "07:00",
    endTime: "15:30",
    lunchStart: "12:00",
    lunchEnd: "12:30",
    totalHours: 8.0,
    synced: true,
    notes: "Completed tear-off and dried in."
  },
  {
    id: 502,
    jobId: 102,
    jobName: "Commercial Center - Repair",
    date: "2023-10-25",
    startTime: "08:00",
    endTime: "16:00",
    lunchStart: "12:00",
    lunchEnd: "12:30",
    totalHours: 7.5,
    synced: true,
    notes: "Patched leaks on north side."
  }
];

export const getRecentEntries = (limit = 2): TimeEntry[] => {
  return timeEntries.slice(0, limit);
};

export const getWeeklyHours = (): number => {
  return 38.5; // Mock value
};

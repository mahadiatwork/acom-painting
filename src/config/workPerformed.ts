/**
 * Centralized config for Work Performed activities.
 * Grouped by category (interior / exterior). Extend the interface
 * to add more metadata (e.g. icon, sortOrder, required) later.
 */

export type WorkPerformedCategoryKey = "interior" | "exterior"

/** Single activity; add optional fields here as needed (e.g. icon, sortOrder). */
export interface WorkPerformedActivity {
  /** Stable internal value/code for storage and APIs */
  value: string
  /** User-facing label */
  label: string
}

/** Activities grouped by category. */
export const WORK_PERFORMED_ACTIVITIES: Record<WorkPerformedCategoryKey, WorkPerformedActivity[]> = {
  interior: [
    { value: "prime-walls", label: "Prime walls" },
    { value: "paint-walls", label: "Paint walls" },
    { value: "spray-walls", label: "Spray walls" },
    { value: "cut-and-roll-walls", label: "Cut and roll walls" },
    { value: "paint-door-frames", label: "Paint door frames" },
    { value: "mask-ceilings", label: "Mask ceilings" },
  ],
  exterior: [
    { value: "painting-door-frames", label: "Painting door frames" },
    { value: "paint-siding", label: "Paint siding" },
    { value: "trim-painting", label: "Trim painting" },
    { value: "caulking", label: "Caulking" },
    { value: "masking", label: "Masking" },
  ],
}

/** Category keys in display order. */
export const WORK_PERFORMED_CATEGORY_KEYS: WorkPerformedCategoryKey[] = ["interior", "exterior"]

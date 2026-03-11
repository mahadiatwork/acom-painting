/**
 * Centralized config for Work Performed activities.
 *
 * Data model (all data‑driven, no UI coupling):
 * - Area (interior / exterior)
 *   - Group (e.g. Walls, Trim, Doors)
 *     - Task (specific work item)
 *
 * Material usage is per task entry: paint gallons, primer gallons, and primer source (stock/retail)
 * are stored on each Work Performed entry, not at day level or on a separate materials tab.
 *
 * Future: Job-level production reference (e.g. from CRM) can supply values for trim linear feet,
 * door count, window count, handrail count, stair floors. Use JobProductionReference when available;
 * the entry form can then show reference values or use them as defaults without changing the daily flow.
 */

export type WorkPerformedAreaKey = "interior" | "exterior"

/**
 * Keys for job-level production reference metrics (CRM). When the job has reference data,
 * these fields can be passed in and used as read-only context or optional defaults.
 * Add new keys here when the CRM supports them.
 */
export type WorkPerformedReferenceMetricKey =
  | "trimLinearFeet"
  | "doorCount"
  | "windowCount"
  | "handrailCount"
  | "stairFloors"

/**
 * Job-level production reference (e.g. from CRM). Optional; when present, the Work Performed
 * form can display or use these as reference/defaults. Do not force into daily entry flow until ready.
 */
export interface JobProductionReference {
  trimLinearFeet?: number
  doorCount?: number
  windowCount?: number
  handrailCount?: number
  stairFloors?: number
}

/**
 * Supported measurement types for Work Performed tasks.
 * Each task declares which of these it uses via meta (e.g. showLinearFeet: true).
 * Add new types here and in WorkPerformedTaskMeta / SavedWorkPerformedEntry when needed.
 */
export type WorkPerformedMeasurementType =
  | "quantity"
  | "count"
  | "linearFeet"
  | "stairFloors"
  | "doorCount"
  | "windowCount"
  | "handrailCount"
  | "laborMinutes"
  | "paintGallons"
  | "primerGallons"

export interface WorkPerformedTaskMeta {
  /** Generic quantity (default label: "Quantity of work (if applicable)") */
  showQuantity?: boolean
  quantityLabel?: string
  showPaintGallons?: boolean
  showPrimerGallons?: boolean
  showLaborMinutes?: boolean
  /** Generic count (e.g. items, units) */
  showCount?: boolean
  countLabel?: string
  /** Linear feet (trim, baseboard, etc.) */
  showLinearFeet?: boolean
  linearFeetLabel?: string
  /** Stairs / floors */
  showStairFloors?: boolean
  stairFloorsLabel?: string
  /** Door count */
  showDoorCount?: boolean
  doorCountLabel?: string
  /** Window count */
  showWindowCount?: boolean
  windowCountLabel?: string
  /** Handrail count (extension point for job reference) */
  showHandrailCount?: boolean
  handrailCountLabel?: string
}

export interface WorkPerformedTask {
  /** Stable internal value/code for storage and APIs */
  value: string
  /** User-facing label */
  label: string
  /**
   * Declares which measurement fields this task uses. Only these fields are shown and validated.
   * Defaults when meta is omitted: showQuantity, showPaintGallons, showPrimerGallons true; showLaborMinutes false.
   */
  meta?: WorkPerformedTaskMeta
}

export interface WorkPerformedGroup {
  /** Stable key for the group (e.g. "walls") */
  key: string
  /** User-facing group label (e.g. "Walls") */
  label: string
  /** Tasks within this group */
  tasks: WorkPerformedTask[]
}

/**
 * Optional task-specific numeric measurements. Only keys used by the task's meta are populated.
 * Serialization-friendly. Keys align with JobProductionReference for future CRM defaults.
 */
export interface WorkPerformedMeasurements {
  count?: number
  linearFeet?: number
  stairFloors?: number
  doorCount?: number
  windowCount?: number
  handrailCount?: number
}

/**
 * Normalized Work Performed entry: one item per task, clean and serialization-friendly.
 * - area, groupCode, groupLabel, taskCode, taskLabel: identity
 * - quantity, paintGallonsUsed, primerGallonsUsed, primerSource, laborMinutes: core fields (per task)
 * - measurements: optional task-specific numbers (count, linearFeet, etc.)
 * - sortOrder: optional list order (e.g. index when sending)
 */
export interface WorkPerformedEntry {
  area: WorkPerformedAreaKey
  groupCode: string
  groupLabel: string
  taskCode: string
  taskLabel: string
  quantity: number
  paintGallonsUsed: number
  primerGallonsUsed: number
  primerSource: "stock" | "retail"
  laborMinutes: number
  measurements?: WorkPerformedMeasurements
  sortOrder?: number
}

/**
 * Area → Groups → Tasks
 *
 * This structure is easy to extend:
 * - Add a new area: extend WorkPerformedAreaKey and add an entry here.
 * - Add a new group: push a new WorkPerformedGroup into the array.
 * - Add a new task: push a WorkPerformedTask into the group's tasks array.
 */
export const WORK_PERFORMED_STRUCTURE: Record<WorkPerformedAreaKey, WorkPerformedGroup[]> = {
  interior: [
    {
      key: "walls",
      label: "Walls",
      tasks: [
        {
          value: "prime-walls",
          label: "Prime walls",
          meta: {
            showQuantity: true,
            quantityLabel: "Wall area (if applicable)",
            showPaintGallons: false,
            showPrimerGallons: true,
            showLaborMinutes: true,
          },
        },
        {
          value: "paint-walls",
          label: "Paint walls",
          meta: {
            showQuantity: true,
            showPaintGallons: true,
            showPrimerGallons: false,
          },
        },
        { value: "spray-walls", label: "Spray walls" },
        { value: "cut-and-roll-walls", label: "Cut and roll walls" },
      ],
    },
    {
      key: "doors",
      label: "Doors",
      tasks: [
        {
          value: "paint-door-frames",
          label: "Paint door frames",
          meta: {
            showQuantity: true,
            quantityLabel: "Number of doors (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
          },
        },
      ],
    },
    {
      key: "trim",
      label: "Trim",
      tasks: [
        {
          value: "prep-interior-trim",
          label: "Prep interior trim",
          meta: {
            showQuantity: false,
            showPaintGallons: false,
            showPrimerGallons: false,
            showLaborMinutes: true,
          },
        },
        {
          value: "paint-interior-trim",
          label: "Paint interior trim",
          meta: {
            showQuantity: true,
            quantityLabel: "Quantity (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
            showLaborMinutes: true,
          },
        },
        {
          value: "handrails",
          label: "Handrails",
          meta: {
            showQuantity: true,
            quantityLabel: "Quantity (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
            showLaborMinutes: true,
          },
        },
      ],
    },
    {
      key: "stairs",
      label: "Stairs",
      tasks: [
        {
          value: "steel-stairs",
          label: "Steel stairs",
          meta: {
            showQuantity: true,
            quantityLabel: "Quantity (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
            showLaborMinutes: true,
            showStairFloors: true,
            stairFloorsLabel: "Stair floors (if applicable)",
          },
        },
      ],
    },
    {
      key: "prep",
      label: "Prep / Ceilings",
      tasks: [
        {
          value: "mask-ceilings",
          label: "Mask ceilings",
          meta: {
            showQuantity: true,
            showPaintGallons: false,
            showPrimerGallons: false,
            showLaborMinutes: true,
          },
        },
      ],
    },
  ],
  exterior: [
    {
      key: "doors",
      label: "Doors / Trim",
      tasks: [
        {
          value: "painting-door-frames",
          label: "Painting door frames",
          meta: {
            showQuantity: true,
            quantityLabel: "Number of doors (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
          },
        },
        {
          value: "trim-painting",
          label: "Trim painting",
          meta: {
            showQuantity: true,
            showPaintGallons: true,
            showPrimerGallons: false,
          },
        },
        {
          value: "paint-exterior-trim",
          label: "Paint exterior trim",
          meta: {
            showQuantity: true,
            quantityLabel: "Quantity (if applicable)",
            showPaintGallons: true,
            showPrimerGallons: false,
            showLaborMinutes: true,
          },
        },
      ],
    },
    {
      key: "siding",
      label: "Siding",
      tasks: [{ value: "paint-siding", label: "Paint siding" }],
    },
    {
      key: "prep",
      label: "Prep / Masking / Caulking",
      tasks: [
        {
          value: "caulking",
          label: "Caulking",
          meta: {
            showQuantity: true,
            quantityLabel: "Number of joints (if applicable)",
            showLaborMinutes: true,
            showPaintGallons: false,
            showPrimerGallons: false,
          },
        },
        {
          value: "masking",
          label: "Masking",
          meta: {
            showQuantity: true,
            showLaborMinutes: true,
            showPaintGallons: false,
            showPrimerGallons: false,
          },
        },
      ],
    },
  ],
}

/** Area keys in display order. */
export const WORK_PERFORMED_AREA_KEYS: WorkPerformedAreaKey[] = ["interior", "exterior"]

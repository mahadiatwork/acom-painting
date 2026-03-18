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
  // ─── INTERIOR ───────────────────────────────────────────────────────────────
  interior: [
    // 1. Gyp Walls/Ceilings — 10 tasks from spreadsheet
    {
      key: "gyp-walls-ceilings",
      label: "Gyp Walls/Ceilings",
      tasks: [
        // Prime sub-group
        {
          value: "prime-gyp-cut-roll-standard",
          label: "Prime gyp walls/ceilings cut/roll – standard height",
          meta: { showQuantity: false, showPaintGallons: false, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-gyp-spray-standard",
          label: "Prime gyp walls/ceilings spray – standard height",
          meta: { showQuantity: false, showPaintGallons: false, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-gyp-cut-roll-tall",
          label: "Prime gyp walls/ceilings cut/roll – tall",
          meta: { showQuantity: false, showPaintGallons: false, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-gyp-spray-tall",
          label: "Prime gyp walls/ceilings spray – tall",
          meta: { showQuantity: false, showPaintGallons: false, showPrimerGallons: true, showLaborMinutes: true },
        },
        // Paint sub-group
        {
          value: "paint-gyp-cut-roll-standard",
          label: "Paint gyp walls/ceilings cut/roll – standard height",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-gyp-spray-standard",
          label: "Paint gyp walls/ceilings spray – standard height",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-gyp-cut-roll-tall",
          label: "Paint gyp walls/ceilings cut/roll – tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-gyp-spray-tall",
          label: "Paint gyp walls/ceilings spray – tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        // Mask + different-color ceiling
        {
          value: "mask-paint-gyp-ceiling-diff-color-spray-standard",
          label: "Mask and paint gyp ceilings different color spray – standard height",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "mask-paint-gyp-ceiling-diff-color-spray-tall",
          label: "Mask and paint gyp ceilings different color spray – tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 2. Dryfall Ceilings — 2 tasks
    {
      key: "dryfall-ceilings",
      label: "Dryfall Ceilings",
      tasks: [
        {
          value: "mask-paint-dryfall-ceiling-low",
          label: "Mask and paint dryfall ceiling 15' or lower",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "mask-paint-dryfall-ceiling-tall",
          label: "Mask and paint dryfall ceiling tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 3. Block Walls — 4 tasks
    {
      key: "block-walls",
      label: "Block Walls",
      tasks: [
        {
          value: "paint-block-walls-cut-roll-standard",
          label: "Paint block walls cut/roll – standard height",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-block-walls-spray-standard",
          label: "Paint block walls spray – standard height",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-block-walls-cut-roll-tall",
          label: "Paint block walls cut/roll – tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-block-walls-spray-tall",
          label: "Paint block walls spray – tall",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 4. Doors/Frames — 8 tasks
    {
      key: "doors-frames",
      label: "Doors/Frames",
      tasks: [
        {
          value: "paint-hm-door-frames-spray",
          label: "Paint HM door frames spray",
          meta: { showQuantity: true, quantityLabel: "Number of frames (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-hm-door-frames-cut-roll",
          label: "Paint HM door frames cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of frames (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-hm-doors-spray",
          label: "Paint HM doors spray",
          meta: { showQuantity: true, quantityLabel: "Number of doors (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-hm-doors-cut-roll",
          label: "Paint HM doors cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of doors (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "prime-paint-wood-door-frames-spray",
          label: "Prime and paint wood door frames spray",
          meta: { showQuantity: true, quantityLabel: "Number of frames (if applicable)", showPaintGallons: true, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-paint-wood-door-frames-cut-roll",
          label: "Prime and paint wood door frames cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of frames (if applicable)", showPaintGallons: true, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-paint-wood-doors-spray",
          label: "Prime and paint wood doors spray",
          meta: { showQuantity: true, quantityLabel: "Number of doors (if applicable)", showPaintGallons: true, showPrimerGallons: true, showLaborMinutes: true },
        },
        {
          value: "prime-paint-wood-doors-cut-roll",
          label: "Prime and paint wood doors cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of doors (if applicable)", showPaintGallons: true, showPrimerGallons: true, showLaborMinutes: true },
        },
      ],
    },

    // 5. Windows — 6 tasks
    {
      key: "windows",
      label: "Windows",
      tasks: [
        {
          value: "paint-hm-windows-spray",
          label: "Paint HM windows spray",
          meta: { showQuantity: true, quantityLabel: "Number of windows (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-hm-windows-cut-roll",
          label: "Paint HM windows cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of windows (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-wood-windows-spray",
          label: "Paint wood windows spray",
          meta: { showQuantity: true, quantityLabel: "Number of windows (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-wood-windows-cut-roll",
          label: "Paint wood windows cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of windows (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-wood-window-sills-spray",
          label: "Paint wood window sills spray",
          meta: { showQuantity: true, quantityLabel: "Number of sills (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-wood-window-sills-cut-roll",
          label: "Paint wood window sills cut/roll",
          meta: { showQuantity: true, quantityLabel: "Number of sills (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 6. Trim — 3 tasks
    {
      key: "trim",
      label: "Trim",
      tasks: [
        {
          value: "prep-trim",
          label: "Prep trim (base, case, door/window frames)",
          meta: { showQuantity: false, showPaintGallons: false, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-trim-spray",
          label: "Paint trim (base, case, door/window frames) – spray",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-trim-cut-roll",
          label: "Paint trim (base, case, door/window frames) – cut/roll",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 7. Steel — 3 tasks
    {
      key: "steel",
      label: "Steel",
      tasks: [
        {
          value: "paint-handrails",
          label: "Paint handrails",
          meta: { showQuantity: true, quantityLabel: "Number of handrails (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-steel-stairs-spray",
          label: "Paint steel stairs spray",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true, showStairFloors: true, stairFloorsLabel: "Stair floors (if applicable)" },
        },
        {
          value: "paint-steel-stairs-cut-roll",
          label: "Paint steel stairs cut/roll",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true, showStairFloors: true, stairFloorsLabel: "Stair floors (if applicable)" },
        },
      ],
    },
  ],

  // ─── EXTERIOR ───────────────────────────────────────────────────────────────
  exterior: [
    // 1. Walls — 13 tasks
    {
      key: "walls",
      label: "Walls",
      tasks: [
        {
          value: "paint-siding-1-story",
          label: "Paint siding 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-siding-2-story",
          label: "Paint siding 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-tilt-up-walls-spray",
          label: "Paint tilt up walls spray",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-tilt-up-walls-cut-roll",
          label: "Paint tilt up walls cut/roll",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-metal-siding",
          label: "Paint metal siding",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-efis-spray-1-story",
          label: "Paint EFIS spray 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-efis-spray-2-story",
          label: "Paint EFIS spray 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-efis-cut-roll-1-story",
          label: "Paint EFIS cut/roll 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-efis-cut-roll-2-story",
          label: "Paint EFIS cut/roll 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-existing-block-walls-spray-1-story",
          label: "Paint existing block walls spray 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-existing-block-walls-spray-2-story",
          label: "Paint existing block walls spray 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-existing-block-walls-cut-roll-1-story",
          label: "Paint existing block walls cut/roll 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-existing-block-walls-cut-roll-2-story",
          label: "Paint existing block walls cut/roll 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 2. Trim — 8 tasks
    {
      key: "trim",
      label: "Trim",
      tasks: [
        {
          value: "paint-siding-trim-spray-1-story",
          label: "Paint siding trim spray 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-siding-trim-cut-roll-1-story",
          label: "Paint siding trim cut/roll 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-siding-trim-spray-2-story",
          label: "Paint siding trim spray 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-siding-trim-cut-roll-2-story",
          label: "Paint siding trim cut/roll 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-soffit-spray-1-story",
          label: "Paint soffit spray 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-soffit-cut-roll-1-story",
          label: "Paint soffit cut/roll 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-soffit-spray-2-story",
          label: "Paint soffit spray 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-soffit-cut-roll-2-story",
          label: "Paint soffit cut/roll 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 3. Siloxane — 2 tasks
    {
      key: "siloxane",
      label: "Siloxane",
      tasks: [
        {
          value: "apply-siloxane-1-story",
          label: "Apply Siloxane 1 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "apply-siloxane-2-story",
          label: "Apply Siloxane 2 story",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },

    // 4. Steel — 5 tasks
    {
      key: "steel",
      label: "Steel",
      tasks: [
        {
          value: "ext-paint-handrail",
          label: "Paint handrail",
          meta: { showQuantity: true, quantityLabel: "Number of handrails (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "ext-paint-steel-stairs-spray",
          label: "Paint steel stairs spray",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true, showStairFloors: true, stairFloorsLabel: "Stair floors (if applicable)" },
        },
        {
          value: "ext-paint-steel-stairs-cut-roll",
          label: "Paint steel stairs cut/roll",
          meta: { showQuantity: false, showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true, showStairFloors: true, stairFloorsLabel: "Stair floors (if applicable)" },
        },
        {
          value: "paint-bollards",
          label: "Paint bollards",
          meta: { showQuantity: true, quantityLabel: "Number of bollards (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
        {
          value: "paint-steel-awnings",
          label: "Paint steel awnings",
          meta: { showQuantity: true, quantityLabel: "Number of awnings (if applicable)", showPaintGallons: true, showPrimerGallons: false, showLaborMinutes: true },
        },
      ],
    },
  ],
}

/** Area keys in display order. */
export const WORK_PERFORMED_AREA_KEYS: WorkPerformedAreaKey[] = ["interior", "exterior"]

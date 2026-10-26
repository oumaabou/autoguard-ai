/**
 * faults.ts
 * =========
 * Single source of truth for the 6 fault classes the CNN was trained on.
 *
 * FAULT_LABELS order MUST exactly match ai-pipeline/labels.txt (which in
 * turn matches the alphabetical folder order Keras used during training).
 * If the model is ever retrained with a different class list, update both
 * labels.txt and this file together.
 *
 * Content note: the underlying HUSTmotor dataset is an electric motor test
 * rig (bearing/rotor faults), used here as an acoustic-signature proxy for
 * car engine/accessory faults, per the project's dataset methodology. The
 * descriptions below map each motor fault signature to the closest
 * real-world automotive equivalent rather than inventing specific live
 * sensor readings the model doesn't actually measure.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "./theme";

export const FAULT_LABELS = [
  "bearing_fault",
  "bowed_rotor",
  "broken_rotor_bars",
  "healthy",
  "rotor_misalignment",
  "voltage_unbalance",
] as const;

export type FaultLabel = (typeof FAULT_LABELS)[number];

export type Severity = "healthy" | "warning" | "critical";

/** Shared red/yellow/green mapping for severity, used on both the
 * Diagnostic screen's result card and the History screen's saved-item
 * cards - keep these in sync (single source of truth). */
export const SEVERITY_COLOR: Record<Severity, string> = {
  healthy: colors.primary,
  warning: colors.tertiaryFixedDim,
  critical: colors.secondary,
};

export interface FaultInfo {
  title: string;
  severity: Severity;
  severityHeadline: string;
  summary: string;
  whyFlagged: string[];
  recommendedAction: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

export const FAULT_INFO: Record<FaultLabel, FaultInfo> = {
  bearing_fault: {
    title: "Bearing Wear",
    severity: "critical",
    severityHeadline: "Critical: Do Not Drive",
    summary:
      "The acoustic pattern matches a damaged rolling-element bearing, most often heard in the alternator, water pump, or an idler/tensioner pulley.",
    whyFlagged: [
      "Sharp, high-frequency impulsive ticking or grinding, repeating in a tight rhythmic pattern.",
      "This signature is distinct from normal engine noise and typically worsens with RPM.",
    ],
    recommendedAction:
      "Have the suspected bearing inspected as soon as possible. A seized bearing can cause a belt to fail or a component to lock up while driving.",
    icon: "alert-octagon",
  },
  bowed_rotor: {
    title: "Rotor Imbalance (Bowed Shaft)",
    severity: "warning",
    severityHeadline: "Warning: Schedule a Repair Soon",
    summary:
      "The sound matches a bent or bowed rotating shaft, which produces a smooth, rhythmic vibration tied to engine/accessory speed.",
    whyFlagged: [
      "Low-frequency vibration energy concentrated at the shaft's rotational speed and its harmonics.",
      "Often felt as a physical vibration through the cabin or steering wheel, worsening as RPM increases.",
    ],
    recommendedAction:
      "Have the rotating component (e.g. alternator, drive shaft, or pulley) checked for straightness and balance.",
    icon: "alert",
  },
  broken_rotor_bars: {
    title: "Rotor / Structural Fault",
    severity: "warning",
    severityHeadline: "Warning: Schedule a Repair Soon",
    summary:
      "The pattern resembles a cracked or broken structural element inside a rotating component, causing an uneven acoustic pulse.",
    whyFlagged: [
      "Intermittent low-frequency modulation layered on top of the normal running tone.",
      "Can resemble rotor imbalance but with a more irregular, pulsing texture.",
    ],
    recommendedAction:
      "This fault type can be confused with rotor imbalance acoustically - a mechanic should inspect both possibilities.",
    icon: "alert",
  },
  healthy: {
    title: "No Fault Detected",
    severity: "healthy",
    severityHeadline: "Healthy: No Action Needed",
    summary:
      "The acoustic signature matches normal, healthy operating sound with no signs of the fault patterns this model was trained to detect.",
    whyFlagged: [
      "No abnormal high-frequency impulses, low-frequency vibration harmonics, or irregular modulation detected.",
    ],
    recommendedAction:
      "No action needed right now. Re-check periodically, especially if you notice new sounds or symptoms.",
    icon: "check-circle",
  },
  rotor_misalignment: {
    title: "Shaft Misalignment",
    severity: "warning",
    severityHeadline: "Warning: Schedule a Repair Soon",
    summary:
      "The sound matches a misaligned rotating shaft or pulley, which creates a distinctive vibration pattern different from simple imbalance.",
    whyFlagged: [
      "Vibration energy concentrated at twice the shaft's rotational speed, a signature typical of misalignment rather than imbalance.",
      "Often accompanied by uneven belt or pulley wear over time.",
    ],
    recommendedAction:
      "Have the alignment of the affected pulley, belt, or shaft checked to prevent accelerated wear on nearby components.",
    icon: "alert",
  },
  voltage_unbalance: {
    title: "Electrical / Alternator Imbalance",
    severity: "warning",
    severityHeadline: "Warning: Schedule a Repair Soon",
    summary:
      "The pattern matches an electrical imbalance in a rotating electrical component such as the alternator, producing a subtle rhythmic hum.",
    whyFlagged: [
      "Low-frequency hum with uneven harmonic spacing, distinct from a purely mechanical vibration.",
      "Can point to an electrical fault rather than a purely mechanical one.",
    ],
    recommendedAction:
      "Have the charging system and alternator electrically tested in addition to a mechanical inspection.",
    icon: "flash-alert",
  },
};

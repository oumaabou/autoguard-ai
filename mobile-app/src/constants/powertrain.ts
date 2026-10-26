/**
 * powertrain.ts
 * =============
 * The user's selected powertrain type (Petrol/Diesel, Hybrid, Electric),
 * set in Profile settings.
 *
 * Chatbot/RAG-only concept: it controls which fault_knowledge content the
 * backend surfaces (an electric car has no alternator, belt, or turbo; a
 * petrol car has no traction motor), so answers don't reference parts the
 * user's car doesn't have. It has NO effect on the ML acoustic
 * classifier - that model detects the same 6 acoustic fault signatures
 * (see faults.ts) regardless of powertrain type, and nothing in
 * lib/ml or lib/audio should ever import from this file.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";

export const POWERTRAIN_TYPES = ["petrol", "hybrid", "electric"] as const;

export type PowertrainType = (typeof POWERTRAIN_TYPES)[number];

export interface PowertrainInfo {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

export const POWERTRAIN_INFO: Record<PowertrainType, PowertrainInfo> = {
  petrol: { label: "Petrol/Diesel", icon: "gas-station" },
  hybrid: { label: "Hybrid", icon: "leaf" },
  electric: { label: "Electric", icon: "lightning-bolt" },
};

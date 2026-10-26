export const colors = {
  primary: "#002045",
  primaryContainer: "#1a365d",
  primaryFixed: "#d6e3ff",
  primaryFixedDim: "#adc7f7",
  onPrimary: "#ffffff",
  onPrimaryContainer: "#86a0cd",
  onPrimaryFixed: "#001b3c",

  secondary: "#b7102a",
  secondaryContainer: "#db313f",
  onSecondary: "#ffffff",
  onSecondaryContainer: "#fffbff",

  tertiary: "#2e1e00",
  tertiaryFixed: "#ffdea9",
  tertiaryFixedDim: "#ffba27",
  onTertiaryFixed: "#271900",
  onTertiaryFixedVariant: "#5e4100",

  background: "#f7f9fb",
  surface: "#f7f9fb",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f2f4f6",
  surfaceContainer: "#eceef0",
  surfaceContainerHigh: "#e6e8ea",
  surfaceContainerHighest: "#e0e3e5",
  surfaceDim: "#d8dadc",
  onSurface: "#191c1e",
  onSurfaceVariant: "#43474e",

  outline: "#74777f",
  outlineVariant: "#c4c6cf",

  error: "#ba1a1a",
  onError: "#ffffff",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  headlineLg: { fontSize: 30, lineHeight: 40, fontWeight: "700" as const },
  headlineLgMobile: { fontSize: 26, lineHeight: 34, fontWeight: "700" as const },
  headlineMd: { fontSize: 24, lineHeight: 32, fontWeight: "600" as const },
  bodyLg: { fontSize: 20, lineHeight: 30, fontWeight: "400" as const },
  bodyMd: { fontSize: 18, lineHeight: 28, fontWeight: "400" as const },
  labelStatus: { fontSize: 16, lineHeight: 24, fontWeight: "600" as const },
  labelCaps: { fontSize: 14, lineHeight: 20, fontWeight: "700" as const, letterSpacing: 0.7 },
};

export const ROLE_COLORS: Record<string, { body: number; label: string }> = {
  ceo: { body: 0x1e3a5f, label: "CEO" },
  chro: { body: 0x4c1d95, label: "CHRO" },
  cto: { body: 0x065f46, label: "CTO" },
  cmo: { body: 0x9d174d, label: "CMO" },
  cfo: { body: 0x78350f, label: "CFO" },
  engineer: { body: 0x4a1d96, label: "ENG" },
  designer: { body: 0xb45309, label: "DES" },
  pm: { body: 0x7c2d12, label: "PM" },
  qa: { body: 0x831843, label: "QA" },
  devops: { body: 0x065f46, label: "OPS" },
  researcher: { body: 0x9333ea, label: "RES" },
  general: { body: 0x6b7280, label: "GEN" },
};

export function getRoleVisual(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.general!;
}

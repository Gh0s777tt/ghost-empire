// src/components/admin/types.ts — shared admin types hoisted from AdminClient so
// lazily-loaded section modules can import them without pulling in the monolith.

export type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string | null;
  targetName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
};

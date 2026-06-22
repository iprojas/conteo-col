export type ActStatus = "pending" | "no_discrepancy" | "discrepancy";

export interface MunicipalitySummary {
  id: string;
  name: string;
  departmentCode: string;
  total: number;
  pending: number;
  reviewed: number;
  discrepancies: number;
}

export interface ActRow {
  id: string;
  municipalityId: string;
  municipalityName: string;
  departmentCode: string;
  zone: string;
  station: string;
  tableNumber: string;
  status: ActStatus;
  comment: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
}

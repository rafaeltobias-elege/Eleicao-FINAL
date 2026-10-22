export type ShiftType = 'Manhã' | 'Tarde' | 'Integral';
export type ShiftFilterMode = 'MANHA' | 'TARDE' | 'TODOS';

export interface StaffMember {
  unit: string;
  rank: string;
  re: string;
  name: string;
  phone: string;
  local: string;
  function: string; // e.g. 'Comandante', 'Coordenador Operacional', 'Supervisão Eleições', 'Ronda Eleições', ''
  shiftRaw: string;
  vehicle?: string;
  driver?: string;
}

export interface SchoolOfficer {
  rank: string;
  re: string;
  name: string;
  phone: string;
  vehicle?: string;
}

export interface SchoolItem {
  id: string;
  zone: string;
  school: string;
  bairro: string;
  city: string;
  opm: string;
  am: SchoolOfficer;
  pm: SchoolOfficer;
  amOfficers?: SchoolOfficer[];
  pmOfficers?: SchoolOfficer[];
  lat?: number;
  lng?: number;
  address?: string;
}

export interface CheckInRecord {
  id: string;
  key: string; // format: school:RE:SchoolName:Shift
  type: 'checkin';
  schoolName: string;
  city: string;
  officerRe: string;
  officerName: string;
  rank: string;
  shift: string;
  time: string; // 'HH:mm:ss'
  timestamp: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distanceMeters: number | null;
  isOutOfRange: boolean; // > 150m
  protocol: string;
  syncedToSheets?: boolean;
  isValidated?: boolean;
  validatedBy?: string;
  validatedAt?: string;
  validatedTimestamp?: number;
  auditNotes?: string;
  auditStatus?: 'conforme' | 'irregular' | 'validado_ressalva' | 'pendente';
  // Entrega de Mídias / Disquetes no Cartório Eleitoral (Turno da Tarde / Conclusão da Missão)
  mediaDelivered?: boolean;
  mediaDeliveredAt?: string;
  mediaDeliveredTimestamp?: number;
  mediaDeliveredProtocol?: string;
  mediaDeliveredLat?: number | null;
  mediaDeliveredLng?: number | null;
  mediaDeliveredAccuracy?: number | null;
  mediaDeliveredNotes?: string;
}

export interface RondaRecord {
  id: string;
  key: string; // format: ronda:RE:SchoolName
  type: 'ronda';
  schoolName: string;
  city: string;
  officerRe: string;
  officerName: string;
  rank: string;
  situation: 'sem' | 'com';
  obs: string;
  time: string;
  timestamp: number;
  lat: number | null;
  lng: number | null;
  shift?: 'Manhã' | 'Tarde';
  syncedToSheets?: boolean;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export interface GoogleSheetsConfig {
  fixedStaffSheetId: string;
  fixedStaffSheetName: string;
  motorizedStaffSheetId: string;
  motorizedStaffSheetName: string;
  coordinatesSheetId?: string;
  coordinatesSheetName?: string;
  checkinsTabName: string;
  autoSync: boolean;
  lastSyncTime?: string;
  operationalPassword?: string;
}

export const DEFAULT_SHEETS_CONFIG: GoogleSheetsConfig = {
  fixedStaffSheetId: '1PYjEtFpfbXBOTsrrbxhiLUYzJSsg8AiM',
  fixedStaffSheetName: 'Planilha Efetivo Fixo (Postos Eleitorais)',
  motorizedStaffSheetId: '1sw3mHOAHLekMt3heclkjLrCU3j69NP0M',
  motorizedStaffSheetName: 'Planilha Efetivo Motorizado (Ronda e Supervisão)',
  coordinatesSheetId: '1D7GPeDrYXW0r5bbtdN0KupHy8lOR0efd',
  coordinatesSheetName: 'Escolas - Coordenadas',
  checkinsTabName: 'Check-ins_Eleicoes2026',
  autoSync: true,
  operationalPassword: '22BPMIP3'
};

export interface DeviceBinding {
  deviceId: string;
  boundRe: string;
  boundName: string;
  boundRank: string;
  boundEmail?: string;
  boundAt: string;
}

export interface AuditJustificationRecord {
  id: string;
  timestamp: number;
  dateTimeStr: string;
  deviceId?: string;
  userEmail?: string;
  originRe?: string;
  originName?: string;
  originRank?: string;
  targetRe?: string;
  targetName?: string;
  justification?: string;
  action?: string;
  officer?: string;
  reason?: string;
  notes?: string;
  executor?: string;
  syncedToSheets?: boolean;
}

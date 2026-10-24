import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { optionalAuth, requireAuth, type AuthRequest } from './src/middleware/auth';
import { isSqlHostConfigured } from './src/db/index';
import { getOrCreateUser, getUsers } from './src/db/users';
import {
  getCheckInsFromDb,
  insertCheckInToDb,
  updateCheckInValidationInDb,
  updateCheckInMediaDeliveryInDb,
  bulkUpdateCheckInValidationInDb,
  getRondasFromDb,
  insertRondaToDb,
  getSchoolsFromDb,
  saveSchoolsToDb,
  getStaffFromDb,
  saveStaffToDb,
  getDeviceBindingsFromDb,
  saveDeviceBindingToDb,
  getAuditLogsFromDb,
  saveAuditLogToDb,
  getConfigFromDb,
  saveConfigToDb,
  wipeAllDbTables,
  deleteCheckInFromDb,
  deleteRondaFromDb,
  deleteDeviceBindingFromDb,
  deleteAuditLogFromDb,
  clearRangeFromDb,
} from './src/db/operations';
import { parseFixedStaffSheet, parseMotorizedStaffSheet, parseCoordinatesSheet } from './src/services/googleWorkspace';
import { resolveMunicipality } from './src/utils/municipality';
import { findSchoolCoordinates, matchSchoolWithGeoEntries } from './src/data/schoolCoordinates';
import { isGcmSchool } from './src/utils/checkinStatus';
import { normalizeText } from './src/utils/normalize';
import type { SchoolItem, StaffMember } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // ==========================================
  // API ROUTES (Cloud SQL PostgreSQL Backend)
  // ==========================================

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      engine: isSqlHostConfigured() ? 'cloudsql_postgresql' : 'resilient_storage',
      operational: true,
    });
  });

  // ==========================================
  // GOOGLE SHEETS PROXY (Bypasses Browser CORS)
  // ==========================================
  app.get('/api/sheets/public-tabs', async (req: Request, res: Response) => {
    try {
      const raw = String(req.query.spreadsheetId || '').trim();
      if (!raw) {
        return res.status(400).json({ error: 'spreadsheetId is required' });
      }
      const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const cleanId = match ? match[1] : raw;
      const url = `https://docs.google.com/spreadsheets/d/${cleanId}/htmlview`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        return res.json({ tabs: [] });
      }
      const html = await response.text();
      const tabSet = new Set<string>();

      // Regex 1: standard sheet-button
      const r1 = /<li\s+id=[\"']sheet-button-[^\"']*[\"'][^>]*>.*?<a[^>]*>([^<]+)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = r1.exec(html)) !== null) {
        if (m[1]?.trim()) tabSet.add(m[1].trim());
      }

      // Regex 2: items in sheet-menu
      const menuMatch = html.match(/<ul\s+id=[\"']sheet-menu[\"'][^>]*>([\s\S]*?)<\/ul>/i);
      if (menuMatch) {
        const r2 = /<li[^>]*>.*?<a[^>]*>([^<]+)<\/a>/gi;
        while ((m = r2.exec(menuMatch[1])) !== null) {
          if (m[1]?.trim()) tabSet.add(m[1].trim());
        }
      }

      res.json({ success: true, tabs: Array.from(tabSet) });
    } catch (err: any) {
      console.warn('Proxy public-tabs error:', err);
      res.json({ success: false, tabs: [] });
    }
  });

  app.get('/api/sheets/public-values', async (req: Request, res: Response) => {
    try {
      const raw = String(req.query.spreadsheetId || '').trim();
      const sheetName = req.query.sheetName ? String(req.query.sheetName).trim() : undefined;
      if (!raw) {
        return res.status(400).json({ error: 'spreadsheetId is required' });
      }
      const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const cleanId = match ? match[1] : raw;
      const sheetParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
      const url = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:json${sheetParam}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Google Sheets returned HTTP ${response.status}`,
          rows: [],
        });
      }
      const text = await response.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return res.json({ success: true, rows: [] });
      }
      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const data = JSON.parse(jsonStr);
      const table = data?.table;
      if (!table || !table.rows) {
        return res.json({ success: true, rows: [] });
      }
      const rows: string[][] = [];
      if (table.cols && table.cols.length > 0) {
        const headerRow = table.cols.map((c: any) => (c?.label ? String(c.label) : ''));
        if (headerRow.some((h: string) => h && h.trim().length > 0)) {
          rows.push(headerRow);
        }
      }
      for (const r of table.rows) {
        const rowVals = (r.c || []).map((cell: any) => {
          if (!cell) return '';
          if (cell.f !== undefined && cell.f !== null) return String(cell.f);
          if (cell.v !== undefined && cell.v !== null) return String(cell.v);
          return '';
        });
        rows.push(rowVals);
      }
      res.json({ success: true, rows });
    } catch (err: any) {
      console.warn('Proxy public-values error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch spreadsheet values', rows: [] });
    }
  });

  // ==========================================
  // AUTOMATED GOOGLE SHEETS BACKGROUND SYNC
  // ==========================================
  async function fetchGvizTableRows(spreadsheetId: string, sheetName?: string): Promise<string[][]> {
    try {
      const match = spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const cleanId = match ? match[1] : spreadsheetId;
      const sheetParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
      const url = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:json${sheetParam}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) return [];
      const text = await response.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) return [];
      const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      const table = data?.table;
      if (!table || !table.rows) return [];
      const rows: string[][] = [];
      if (table.cols && table.cols.length > 0) {
        const headerRow = table.cols.map((c: any) => (c?.label ? String(c.label) : ''));
        if (headerRow.some((h: string) => h && h.trim().length > 0)) {
          rows.push(headerRow);
        }
      }
      for (const r of table.rows) {
        const rowVals = (r.c || []).map((cell: any) => {
          if (!cell) return '';
          if (cell.f !== undefined && cell.f !== null) return String(cell.f);
          if (cell.v !== undefined && cell.v !== null) return String(cell.v);
          return '';
        });
        rows.push(rowVals);
      }
      return rows;
    } catch (e) {
      console.warn('[AutoSync Server] fetchGvizTableRows error:', e);
      return [];
    }
  }

  function isRealStaffMemberServer(item: any): boolean {
    if (!item || !item.re) return false;
    const reUpper = String(item.re).trim().toUpperCase();
    if (reUpper.startsWith('MOT-') || reUpper.startsWith('N/D-')) return false;
    const normName = normalizeText(item.name || '');
    if (!normName || normName.includes('QUADRO') || normName.includes('TOTAL') || normName === 'N/D') return false;
    return true;
  }

  async function syncGoogleSheetsDirectly(): Promise<{ success: boolean; schoolsCount: number; staffCount: number; lastSync: string }> {
    try {
      const FIXED_SHEET_ID = '1PYjEtFpfbXBOTsrrbxhiLUYzJSsg8AiM';
      const MOTORIZED_SHEET_ID = '1sw3mHOAHLekMt3heclkjLrCU3j69NP0M';
      const COORDS_SHEET_ID = '1D7GPeDrYXW0r5bbtdN0KupHy8lOR0efd';

      // 1. Coordinates
      let geoEntries: any[] = [];
      try {
        const coordRows = await fetchGvizTableRows(COORDS_SHEET_ID);
        if (coordRows.length > 0) {
          geoEntries = parseCoordinatesSheet(coordRows);
        }
      } catch (e) {
        console.warn('[AutoSync Server] Coordenadas error:', e);
      }

      // 2. Fixed Schools
      const fixedRows = await fetchGvizTableRows(FIXED_SHEET_ID);
      if (fixedRows.length > 0) {
        const parsedSchools = parseFixedStaffSheet(fixedRows);
        // Guard: strictly ignore if less than 50 schools (prevents resetting to partial lists)
        if (parsedSchools.length >= 50) {
          const normalizedSchools: SchoolItem[] = parsedSchools.map((s) => {
            const resolvedCity = resolveMunicipality(s.city, s.school, s.address, s.bairro, s.zone, s.opm);
            let lat = s.lat;
            let lng = s.lng;
            let address = s.address;
            let bairro = s.bairro;

            if (geoEntries.length > 0) {
              const matched = matchSchoolWithGeoEntries(s.school, resolvedCity, geoEntries);
              if (matched) {
                if (matched.latitude && matched.longitude) {
                  lat = matched.latitude;
                  lng = matched.longitude;
                }
                if (matched.logradouro) address = matched.logradouro;
                if (matched.bairro) bairro = matched.bairro;
              }
            }

            if (!lat || !lng) {
              const geo = findSchoolCoordinates(s.school, resolvedCity);
              if (geo && geo.lat && geo.lng) {
                lat = geo.lat;
                lng = geo.lng;
                if (!address) address = geo.address;
                if (!bairro && geo.bairro) bairro = geo.bairro;
              }
            }

            return {
              ...s,
              city: resolvedCity,
              lat,
              lng,
              address,
              bairro: bairro || s.bairro
            };
          }).filter((s) => !isGcmSchool(s));

          if (normalizedSchools.length >= 50) {
            await saveSchoolsToDb(normalizedSchools, true);
            console.log(`[AutoSync Server] Sincronização automática OK: ${normalizedSchools.length} postos eleitorais atualizados.`);
          }
        }
      }

      // 3. Motorized Staff
      const motRows = await fetchGvizTableRows(MOTORIZED_SHEET_ID);
      if (motRows.length > 0) {
        const parsedStaff = parseMotorizedStaffSheet(motRows).filter(isRealStaffMemberServer);
        if (parsedStaff.length >= 20) {
          await saveStaffToDb(parsedStaff, true);
          console.log(`[AutoSync Server] Sincronização automática OK: ${parsedStaff.length} policiais de apoio/motorizados atualizados.`);
        }
      }

      const lastSync = new Date().toISOString();
      const currentSchools = await getSchoolsFromDb();
      const currentStaff = await getStaffFromDb();
      return {
        success: true,
        schoolsCount: currentSchools.length,
        staffCount: currentStaff.length,
        lastSync
      };
    } catch (err: any) {
      console.warn('[AutoSync Server] Aviso na sincronização automática:', err);
      const currentSchools = await getSchoolsFromDb();
      const currentStaff = await getStaffFromDb();
      return {
        success: false,
        schoolsCount: currentSchools.length,
        staffCount: currentStaff.length,
        lastSync: new Date().toISOString()
      };
    }
  }

  // Auto-sync endpoints for client triggers or status polling
  app.post('/api/sheets/auto-sync', async (_req: Request, res: Response) => {
    const result = await syncGoogleSheetsDirectly();
    res.json(result);
  });

  app.get('/api/sheets/auto-sync', async (_req: Request, res: Response) => {
    const schools = await getSchoolsFromDb();
    const staff = await getStaffFromDb();
    res.json({ success: true, schoolsCount: schools.length, staffCount: staff.length });
  });

  // Users (Firebase Auth synchronization)
  app.post('/api/users/sync', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { uid, email } = req.body;
      const targetUid = req.user?.uid || uid;
      const targetEmail = req.user?.email || email;

      if (!targetUid || !targetEmail) {
        return res.status(400).json({ error: 'UID and email are required' });
      }

      const user = await getOrCreateUser(targetUid, targetEmail);
      res.json(user);
    } catch (error: any) {
      console.error('Failed to sync user:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  app.get('/api/users', optionalAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const users = await getUsers();
      res.json(users);
    } catch (error: any) {
      console.error('Failed to get users:', error);
      res.status(500).json({ error: error.message || 'Failed to get users' });
    }
  });

  // Check-ins (High-throughput operations)
  app.get('/api/checkins', async (_req: Request, res: Response) => {
    try {
      const list = await getCheckInsFromDb();
      res.json(list);
    } catch (error: any) {
      console.error('Failed to get check-ins:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve check-ins' });
    }
  });

  app.post('/api/checkins', async (req: Request, res: Response) => {
    try {
      await insertCheckInToDb(req.body);
      res.status(201).json({ success: true, id: req.body.id });
    } catch (error: any) {
      console.error('Failed to record check-in:', error);
      res.status(500).json({ error: error.message || 'Failed to record check-in' });
    }
  });

  app.patch('/api/checkins/:id/validate', async (req: Request, res: Response) => {
    try {
      await updateCheckInValidationInDb(req.params.id, req.body);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to validate check-in:', error);
      res.status(500).json({ error: error.message || 'Failed to update validation' });
    }
  });

  app.patch('/api/checkins/:id/media-delivery', async (req: Request, res: Response) => {
    try {
      await updateCheckInMediaDeliveryInDb(req.params.id, req.body);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to update media delivery:', error);
      res.status(500).json({ error: error.message || 'Failed to update media delivery' });
    }
  });

  app.post('/api/checkins/bulk-validate', async (req: Request, res: Response) => {
    try {
      const { ids, updates } = req.body;
      if (!Array.isArray(ids) || !updates) {
        return res.status(400).json({ error: 'Invalid payload: ids and updates required' });
      }
      await bulkUpdateCheckInValidationInDb(ids, updates);
      res.json({ success: true, count: ids.length });
    } catch (error: any) {
      console.error('Failed to bulk validate check-ins:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk update check-ins' });
    }
  });

  // Rondas
  app.get('/api/rondas', async (_req: Request, res: Response) => {
    try {
      const list = await getRondasFromDb();
      res.json(list);
    } catch (error: any) {
      console.error('Failed to get rondas:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve rondas' });
    }
  });

  app.post('/api/rondas', async (req: Request, res: Response) => {
    try {
      await insertRondaToDb(req.body);
      res.status(201).json({ success: true, id: req.body.id });
    } catch (error: any) {
      console.error('Failed to record ronda:', error);
      res.status(500).json({ error: error.message || 'Failed to record ronda' });
    }
  });

  // Schools
  app.get('/api/schools', async (_req: Request, res: Response) => {
    try {
      const list = await getSchoolsFromDb();
      res.json(list);
    } catch (error: any) {
      console.error('Failed to get schools:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve schools' });
    }
  });

  app.post('/api/schools', async (req: Request, res: Response) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Payload must be an array of schools' });
      }
      await saveSchoolsToDb(req.body);
      res.json({ success: true, count: req.body.length });
    } catch (error: any) {
      console.error('Failed to save schools:', error);
      res.status(500).json({ error: error.message || 'Failed to save schools' });
    }
  });

  // Staff
  app.get('/api/staff', async (_req: Request, res: Response) => {
    try {
      const list = await getStaffFromDb();
      res.json(list);
    } catch (error: any) {
      console.error('Failed to get staff:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve staff' });
    }
  });

  app.post('/api/staff', async (req: Request, res: Response) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Payload must be an array of staff members' });
      }
      await saveStaffToDb(req.body);
      res.json({ success: true, count: req.body.length });
    } catch (error: any) {
      console.error('Failed to save staff:', error);
      res.status(500).json({ error: error.message || 'Failed to save staff' });
    }
  });

  // Device Bindings
  app.get('/api/device-bindings', async (_req: Request, res: Response) => {
    try {
      const bindings = await getDeviceBindingsFromDb();
      res.json(bindings);
    } catch (error: any) {
      console.error('Failed to get device bindings:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve device bindings' });
    }
  });

  app.post('/api/device-bindings', async (req: Request, res: Response) => {
    try {
      await saveDeviceBindingToDb(req.body);
      res.json({ success: true, deviceId: req.body.deviceId });
    } catch (error: any) {
      console.error('Failed to save device binding:', error);
      res.status(500).json({ error: error.message || 'Failed to save device binding' });
    }
  });

  // Audit Logs
  app.get('/api/audit-logs', async (_req: Request, res: Response) => {
    try {
      const logs = await getAuditLogsFromDb();
      res.json(logs);
    } catch (error: any) {
      console.error('Failed to get audit logs:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve audit logs' });
    }
  });

  app.post('/api/audit-logs', async (req: Request, res: Response) => {
    try {
      await saveAuditLogToDb(req.body);
      res.status(201).json({ success: true, id: req.body.id });
    } catch (error: any) {
      console.error('Failed to record audit log:', error);
      res.status(500).json({ error: error.message || 'Failed to save audit log' });
    }
  });

  // System Configuration
  app.get('/api/config/:key', async (req: Request, res: Response) => {
    try {
      const config = await getConfigFromDb(req.params.key);
      res.json(config);
    } catch (error: any) {
      console.error(`Failed to get config ${req.params.key}:`, error);
      res.status(500).json({ error: error.message || 'Failed to retrieve config' });
    }
  });

  app.post('/api/config/:key', async (req: Request, res: Response) => {
    try {
      await saveConfigToDb(req.params.key, req.body);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`Failed to save config ${req.params.key}:`, error);
      res.status(500).json({ error: error.message || 'Failed to save config' });
    }
  });

  // Delete single items
  app.delete('/api/checkins/:id', async (req: Request, res: Response) => {
    try {
      await deleteCheckInFromDb(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete checkin:', error);
      res.status(500).json({ error: error.message || 'Failed to delete checkin' });
    }
  });

  app.delete('/api/rondas/:id', async (req: Request, res: Response) => {
    try {
      await deleteRondaFromDb(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete ronda:', error);
      res.status(500).json({ error: error.message || 'Failed to delete ronda' });
    }
  });

  app.delete('/api/device-bindings/:deviceId', async (req: Request, res: Response) => {
    try {
      await deleteDeviceBindingFromDb(req.params.deviceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete device binding:', error);
      res.status(500).json({ error: error.message || 'Failed to delete device binding' });
    }
  });

  app.delete('/api/audit-logs/:id', async (req: Request, res: Response) => {
    try {
      await deleteAuditLogFromDb(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete audit log:', error);
      res.status(500).json({ error: error.message || 'Failed to delete audit log' });
    }
  });

  app.post('/api/system/clear-range', async (req: Request, res: Response) => {
    try {
      const { from, to } = req.body;
      if (typeof from !== 'number' || typeof to !== 'number') {
        return res.status(400).json({ error: 'from and to numbers are required' });
      }
      await clearRangeFromDb(from, to);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to clear range:', error);
      res.status(500).json({ error: error.message || 'Failed to clear range' });
    }
  });

  // System wipe / database reset
  app.post('/api/system/wipe', async (_req: Request, res: Response) => {
    try {
      await wipeAllDbTables();
      res.json({ success: true, message: 'All database tables wiped successfully.' });
    } catch (error: any) {
      console.error('Failed to wipe database:', error);
      res.status(500).json({ error: error.message || 'Failed to wipe database' });
    }
  });

  // ==========================================
  // FRONTEND INTEGRATION (Vite Dev / Prod)
  // ==========================================

  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(distPath);
  const isDev = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production' || (!isDev && hasDist);

  if (isProduction && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloud SQL Full-Stack Server listening on http://0.0.0.0:${PORT}`);

    // Trigger initial background sync 2 seconds after server starts
    setTimeout(() => {
      syncGoogleSheetsDirectly().catch((e) => console.warn('[AutoSync Server] Initial sync notice:', e));
    }, 2000);

    // Periodically re-sync every 3 minutes so changes in Google Sheets reflect automatically
    setInterval(() => {
      syncGoogleSheetsDirectly().catch((e) => console.warn('[AutoSync Server] Periodic sync notice:', e));
    }, 3 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});

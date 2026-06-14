const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('../database');
const syncWorker = require('../sync-worker');

const app = express();

app.use(cors());
app.use(express.json());

// Middleware to ensure database schema is initialized before handling requests
app.use(async (req, res, next) => {
  try {
    await db.initPromise;
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database initialization failed: ' + err.message });
  }
});

// 1. Tenants CRUD Endpoints
app.get('/api/tenants', async (req, res) => {
  try {
    const tenants = await db.getTenants();
    res.json({ success: true, data: tenants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tenants', async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, error: 'Name and slug are required.' });
    }
    const tenant = await db.addTenant(name, slug);
    // Restart scheduler if running in standalone mode
    if (global.setupSchedulerFunc) {
      global.setupSchedulerFunc();
    }
    res.json({ success: true, message: 'Tenant created successfully.', data: tenant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.deleteTenant(id);
    // Restart scheduler
    if (global.setupSchedulerFunc) {
      global.setupSchedulerFunc();
    }
    res.json({ success: true, message: 'Tenant deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Settings Endpoints (Tenant specific)
app.get('/api/settings', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const settings = await db.getSettings(tenantId);
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const fields = req.body;
    
    delete fields.id;
    delete fields.created_at;
    
    await db.updateSettings(tenantId, fields);
    
    // Automatically fetch mappings and auto-map
    try {
      await syncWorker.fetchBillzMappingEntities(tenantId);
    } catch (mapErr) {
      console.warn('Failed to auto-map entities on settings save:', mapErr.message);
    }
    
    if (global.setupSchedulerFunc) {
      global.setupSchedulerFunc();
    }
    
    res.json({ success: true, message: 'Settings updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Mappings Endpoints (Tenant specific)
app.get('/api/mappings', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const type = req.query.type;
    const mappings = await db.getMappings(tenantId, type);
    res.json({ success: true, data: mappings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mappings', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const { type, billz_id, billz_name, shamcrm_id, shamcrm_name } = req.body;
    
    if (!type || !billz_id) {
      return res.status(400).json({ success: false, error: 'Type and Billz ID are required.' });
    }
    
    await db.saveMapping(tenantId, type, billz_id, billz_name, shamcrm_id, shamcrm_name);
    res.json({ success: true, message: 'Mapping saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Logs Endpoints (Tenant specific)
app.get('/api/logs', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type || null;
    const logs = await db.getLogs(tenantId, limit, type);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    await db.clearLogs(tenantId);
    res.json({ success: true, message: 'Logs cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Manual Sync Triggers (Tenant specific)
app.post('/api/sync/products', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    syncWorker.syncProducts(tenantId)
      .then(result => console.log(`Manual Product Sync completed for Tenant ${tenantId}:`, result))
      .catch(err => console.error(`Manual Product Sync failed for Tenant ${tenantId}:`, err));
      
    res.json({ success: true, message: 'Products synchronization started in the background.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/clients', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    syncWorker.syncClients(tenantId)
      .then(result => console.log(`Manual Client Sync completed for Tenant ${tenantId}:`, result))
      .catch(err => console.error(`Manual Client Sync failed for Tenant ${tenantId}:`, err));

    res.json({ success: true, message: 'Clients synchronization started in the background.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/cashbox', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    syncWorker.syncCashbox(tenantId)
      .then(result => console.log(`Manual Cashbox Sync completed for Tenant ${tenantId}:`, result))
      .catch(err => console.error(`Manual Cashbox Sync failed for Tenant ${tenantId}:`, err));

    res.json({ success: true, message: 'Cashbox synchronization started in the background.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/fetch-mappings', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    await syncWorker.fetchBillzMappingEntities(tenantId);
    const mappings = await db.getMappings(tenantId);
    res.json({ success: true, message: 'Fetched mapping options from Billz.', data: mappings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch Storages and Cash Registers from ShamCRM dynamically
app.get('/api/shamcrm/options', async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId) || 1;
    const settings = await db.getSettings(tenantId);
    if (!settings || !settings.shamcrm_url || !settings.shamcrm_token || settings.shamcrm_url === 'http://localhost') {
      return res.json({ success: true, data: { storages: [], cashboxes: [] } });
    }

    const axios = require('axios');
    const client = axios.create({
      baseURL: settings.shamcrm_url,
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${settings.shamcrm_token}`
      }
    });

    let storages = [];
    try {
      const resStorage = await client.get('/api/storage');
      const sData = resStorage.data.data || resStorage.data || [];
      if (Array.isArray(sData)) {
        storages = sData;
      }
    } catch (err) {
      console.warn('Failed to fetch shamcrm storages:', err.message);
    }

    let cashboxes = [];
    try {
      const resCash = await client.get('/api/initial-balance/get/cash-registers');
      const cData = resCash.data.data || resCash.data || [];
      if (Array.isArray(cData)) {
        cashboxes = cData;
      }
    } catch (err) {
      console.warn('Failed to fetch shamcrm cash registers:', err.message);
    }

    res.json({
      success: true,
      data: {
        storages: storages.map(s => ({ id: s.id, name: s.name })),
        cashboxes: cashboxes.map(c => ({ id: c.id, name: c.name }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vercel Cron endpoint trigger (handles all tenants sequentially)
app.get('/api/cron-sync', async (req, res) => {
  try {
    const tenants = await db.getTenants();
    console.log(`Vercel Cron Triggered. Syncing ${tenants.length} tenants...`);
    
    for (const tenant of tenants) {
      try {
        const settings = await db.getSettings(tenant.id);
        if (!settings) continue;
        
        if (settings.sync_products_active) {
          await syncWorker.syncProducts(tenant.id);
        }
        if (settings.sync_clients_active) {
          await syncWorker.syncClients(tenant.id);
        }
        if (settings.sync_cashbox_active) {
          await syncWorker.syncCashbox(tenant.id);
        }
      } catch (innerErr) {
        console.error(`Sync error for tenant ${tenant.id}:`, innerErr.message);
      }
    }
    
    res.json({ success: true, message: 'Completed sync run for all tenants.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

module.exports = app;

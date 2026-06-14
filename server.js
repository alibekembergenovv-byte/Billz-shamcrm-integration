const app = require('./api/index');
const cron = require('node-cron');
const db = require('./database');
const syncWorker = require('./sync-worker');

const PORT = process.env.PORT || 5000;

// Standalone Cron Scheduler for local execution
let activeJobs = [];

async function setupScheduler() {
  try {
    // Clear all existing jobs
    activeJobs.forEach(job => job.stop());
    activeJobs = [];

    const tenants = await db.getTenants();
    console.log(`Setting up cron scheduler for ${tenants.length} tenants.`);

    for (const tenant of tenants) {
      const settings = await db.getSettings(tenant.id);
      if (!settings) continue;

      const interval = settings.sync_interval || 15;
      const cronExpression = `*/${interval} * * * *`;

      if (settings.sync_products_active) {
        const job = cron.schedule(cronExpression, () => {
          console.log(`Automated Product Sync triggered for tenant ${tenant.name} (${tenant.id})...`);
          syncWorker.syncProducts(tenant.id).catch(err => console.error(`Scheduled Product Sync error for tenant ${tenant.id}:`, err));
        });
        activeJobs.push(job);
      }

      if (settings.sync_clients_active) {
        const job = cron.schedule(cronExpression, () => {
          console.log(`Automated Client Sync triggered for tenant ${tenant.name} (${tenant.id})...`);
          syncWorker.syncClients(tenant.id).catch(err => console.error(`Scheduled Client Sync error for tenant ${tenant.id}:`, err));
        });
        activeJobs.push(job);
      }

      if (settings.sync_cashbox_active) {
        const job = cron.schedule(cronExpression, () => {
          console.log(`Automated Cashbox Sync triggered for tenant ${tenant.name} (${tenant.id})...`);
          syncWorker.syncCashbox(tenant.id).catch(err => console.error(`Scheduled Cashbox Sync error for tenant ${tenant.id}:`, err));
        });
        activeJobs.push(job);
      }
    }
  } catch (err) {
    console.error('Error setting up scheduler:', err);
  }
}

// Bind scheduler function to global namespace so api/index.js can call it when tenants/settings change
global.setupSchedulerFunc = setupScheduler;

// Start Server after Database Initialization
db.initPromise.then(() => {
  app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
    db.addLog(1, 'INFO', 'SYSTEM', 'Express API serveri ishga tushirildi.');
    setupScheduler();
  });
}).catch(err => {
  console.error('Failed to initialize database schema, server aborted:', err);
});

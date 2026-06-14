const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'd:/Programms/billz_shamcrm_integration/database.sqlite';
const db = new sqlite3.Database(dbPath);

db.get("SELECT shamcrm_url, shamcrm_token, organization_id FROM tenants WHERE id = 1", [], async (err, row) => {
  db.close();
  if (err || !row) {
    console.error(err);
    return;
  }
  
  const { shamcrm_url, shamcrm_token, organization_id } = row;
  const client = axios.create({
    baseURL: shamcrm_url,
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shamcrm_token}`
    }
  });

  try {
    const res = await client.post('/api/lead', {
      name: "Test Client Check",
      phone: "+998909999999",
      lead_status_id: 1,
      organization_id: organization_id,
      manager_id: 1,
      source_id: 1
    });
    console.log("Success:", res.status, res.data);
  } catch (e) {
    console.log("Error status:", e.response ? e.response.status : 'No response');
    console.log("Error data:", e.response ? e.response.data : e.message);
  }
});

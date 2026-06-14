const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'd:/Programms/billz_shamcrm_integration/database.sqlite';
const db = new sqlite3.Database(dbPath);

db.get("SELECT shamcrm_url, shamcrm_token, organization_id FROM tenants WHERE id = 1", [], async (err, row) => {
  db.close();
  if (err || !row) {
    console.error("Failed to read credentials:", err);
    return;
  }
  
  const { shamcrm_url, shamcrm_token, organization_id } = row;
  console.log(`Testing lead endpoints on: ${shamcrm_url}`);
  
  if (!shamcrm_token || shamcrm_url === 'http://localhost') {
    console.log("No ShamCRM token or valid URL configured.");
    return;
  }

  const client = axios.create({
    baseURL: shamcrm_url,
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shamcrm_token}`
    }
  });

  const payload = {
    name: "Test Client Method Check",
    phone: "+998909999999",
    lead_status_id: 1,
    organization_id: organization_id,
    manager_id: 1,
    source_id: 1
  };

  // 1. Test POST /api/lead (Creation)
  try {
    const res = await client.post('/api/lead', payload);
    console.log("POST /api/lead (Creation) - Success!", res.status);
    const leadId = res.data.id || (res.data.data && res.data.data.id);
    
    if (leadId) {
      console.log(`Created lead ID: ${leadId}. Now testing updates...`);
      
      // Test POST /api/lead/:id (Update)
      try {
        const updateRes = await client.post(`/api/lead/${leadId}`, { ...payload, name: "Test Client POST Update" });
        console.log("POST /api/lead/:id - Success!", updateRes.status);
      } catch (e) {
        console.log("POST /api/lead/:id - Failed!", e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
      }

      // Test PUT /api/lead/:id (Update)
      try {
        const updateRes = await client.put(`/api/lead/${leadId}`, { ...payload, name: "Test Client PUT Update" });
        console.log("PUT /api/lead/:id - Success!", updateRes.status);
      } catch (e) {
        console.log("PUT /api/lead/:id - Failed!", e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
      }

      // Test PATCH /api/lead/:id (Update)
      try {
        const updateRes = await client.patch(`/api/lead/${leadId}`, { ...payload, name: "Test Client PATCH Update" });
        console.log("PATCH /api/lead/:id - Success!", updateRes.status);
      } catch (e) {
        console.log("PATCH /api/lead/:id - Failed!", e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
      }
    }
  } catch (e) {
    console.log("POST /api/lead (Creation) - Failed!", e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
  }
});

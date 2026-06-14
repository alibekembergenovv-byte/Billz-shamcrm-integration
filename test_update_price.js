const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'd:/Programms/billz_shamcrm_integration/database.sqlite';
const db = new sqlite3.Database(dbPath);

db.get("SELECT shamcrm_url, shamcrm_token, organization_id, sales_funnel_id FROM tenants WHERE id = 1", [], async (err, row) => {
  db.close();
  if (err || !row) {
    console.error(err);
    return;
  }
  
  const { shamcrm_url, shamcrm_token, organization_id, sales_funnel_id } = row;
  const client = axios.create({
    baseURL: shamcrm_url,
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shamcrm_token}`
    }
  });

  try {
    const getRes = await client.get('/api/good/1');
    const variants = getRes.data.result.variants || [];
    const liveVariantId = variants.length > 0 ? variants[0].id : null;
    console.log(`Live variant ID: ${liveVariantId}`);

    const res = await client.post('/api/good/1', {
      name: "Test Product Empty Variants (Updated Price)",
      category_id: "1",
      description: "Test description",
      unit_id: "1",
      is_active: "1",
      is_popular: "0",
      is_new: "0",
      is_sale: "0",
      is_service: "0",
      attributes: [],
      price: 150000.00, // Number at root
      variants: liveVariantId ? [
        {
          id: liveVariantId,
          price: 150000.00, // Number inside variant
          is_active: "1",
          variant_attributes: []
        }
      ] : [],
      organization_id: organization_id.toString(),
      sales_funnel_id: sales_funnel_id.toString()
    });
    console.log("Success:", res.status);
    
    // Fetch details
    const details = await client.get('/api/good/1');
    console.log("Good 1 details after numeric price update:", JSON.stringify(details.data.result, null, 2));
  } catch (e) {
    if (e.response) {
      console.log("Status:", e.response.status);
      console.log("Response:", JSON.stringify(e.response.data));
    } else {
      console.log("Error:", e.message);
    }
  }
});

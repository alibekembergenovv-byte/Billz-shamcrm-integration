const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'd:/Programms/billz_shamcrm_integration/database.sqlite';
const db = new sqlite3.Database(dbPath);

db.get("SELECT shamcrm_url, shamcrm_token FROM tenants WHERE id = 1", [], async (err, row) => {
  db.close();
  if (err || !row) {
    console.error(err);
    return;
  }
  
  const { shamcrm_url, shamcrm_token } = row;
  const client = axios.create({
    baseURL: shamcrm_url,
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${shamcrm_token}`
    }
  });

  const categoryIds = [1, 2, 3];
  for (const id of categoryIds) {
    try {
      const res = await client.get(`/api/category/${id}`);
      console.log(`Category ${id} details:`, JSON.stringify(res.data));
    } catch (e) {
      console.log(`Failed to fetch category ${id}:`, e.response ? e.response.status : e.message);
    }
  }
});

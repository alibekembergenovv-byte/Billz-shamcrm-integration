const fs = require('fs');
const path = require('path');

const jsonPath = 'C:/Users/User/.gemini/antigravity/brain/761ead2a-ecbe-4f8a-b529-084740f0ee82/scratch/shamcrm_api.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function searchItems(items) {
  for (const item of items) {
    if (item.request && item.request.urlObject && item.request.urlObject.path) {
      const pathStr = item.request.urlObject.path.join('/');
      if (pathStr === 'api/good' && item.request.method === 'POST') {
        console.log("Found POST /api/good request:");
        console.log("Name:", item.name);
        console.log("Body:", item.request.body ? item.request.body.raw : 'No body');
      }
    }
    if (item.item) {
      searchItems(item.item);
    }
  }
}

searchItems(data.item || []);

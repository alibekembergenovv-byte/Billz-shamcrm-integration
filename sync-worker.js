const axios = require('axios');
const db = require('./database');

// 1. Helper to get authenticated Axios instance for Billz
async function getBillzClient(tenantId) {
  const settings = await db.getSettings(tenantId);
  if (!settings || !settings.billz_secret) {
    throw new Error('Billz secret key is not configured.');
  }

  const client = axios.create({
    baseURL: 'https://api-admin.billz.ai',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  // Use stored token if available
  let token = settings.billz_token;

  if (!token) {
    token = await loginToBillz(tenantId, settings.billz_secret);
  }

  client.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  // Add interceptor to handle token refresh on 401
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        try {
          const freshSettings = await db.getSettings(tenantId);
          let newToken;
          
          if (freshSettings.billz_refresh_token) {
            newToken = await refreshBillzToken(tenantId, freshSettings.billz_refresh_token);
          } else {
            newToken = await loginToBillz(tenantId, freshSettings.billz_secret);
          }
          
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          // If refresh fails, try a full login
          try {
            const freshSettings = await db.getSettings(tenantId);
            const newToken = await loginToBillz(tenantId, freshSettings.billz_secret);
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
            return client(originalRequest);
          } catch (loginError) {
            await db.addLog(tenantId, 'ERROR', 'SYSTEM', 'Billz tizimiga ulanishda xatolik yuz berdi', loginError.message);
            return Promise.reject(loginError);
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

async function loginToBillz(tenantId, secret) {
  try {
    const res = await axios.post('https://api-admin.billz.ai/v1/auth/login', {
      secret_token: secret
    });
    const data = res.data.data;
    await db.updateSettings(tenantId, {
      billz_token: data.access_token,
      billz_refresh_token: data.refresh_token
    });
    await db.addLog(tenantId, 'INFO', 'SYSTEM', 'Billz API tizimiga muvaffaqiyatli ulanildi.');
    return data.access_token;
  } catch (err) {
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error('Billz login failed: ' + errMsg);
  }
}

async function refreshBillzToken(tenantId, refreshToken) {
  try {
    const res = await axios.post('https://api-admin.billz.ai/v2/auth/refresh', {
      refresh_token: refreshToken
    }, {
      headers: {
        'platform-id': '7d4a4c38-dd84-4902-b744-0488b80a4c01'
      }
    });
    const data = res.data.data;
    await db.updateSettings(tenantId, {
      billz_token: data.access_token,
      billz_refresh_token: data.refresh_token
    });
    return data.access_token;
  } catch (err) {
    throw new Error('Billz token refresh failed: ' + err.message);
  }
}

// 2. Helper to get authenticated Axios instance for ShamCRM
async function getShamCRMClient(tenantId) {
  const settings = await db.getSettings(tenantId);
  if (!settings || !settings.shamcrm_url || !settings.shamcrm_token) {
    throw new Error('ShamCRM API URL or Token is not configured.');
  }

  return axios.create({
    baseURL: settings.shamcrm_url,
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.shamcrm_token}`
    }
  });
}

// 3. Products and Stocks Synchronization
async function syncProducts(tenantId) {
  try {
    await db.addLog(tenantId, 'INFO', 'PRODUCT', 'Tovarlar sinxronizatsiyasi boshlandi...');
    const billz = await getBillzClient(tenantId);
    const sham = await getShamCRMClient(tenantId);
    const settings = await db.getSettings(tenantId);

    // Pull products from Billz (limit 50 per page for safety)
    let page = 1;
    let limit = 50;
    let hasMore = true;
    let totalSynced = 0;

    // Use last_updated_date if we synced before
    const lastSyncTime = settings.last_products_sync;
    const formattedSyncTime = lastSyncTime ? lastSyncTime.replace('T', ' ').substring(0, 19) : null;
    const urlParams = formattedSyncTime ? `&last_updated_date=${encodeURIComponent(formattedSyncTime)}` : '';

    while (hasMore) {
      const res = await billz.get(`/v2/products?limit=${limit}&page=${page}${urlParams}`);
      let productsList = [];
      if (Array.isArray(res.data)) {
        productsList = res.data;
      } else if (res.data.products && Array.isArray(res.data.products)) {
        productsList = res.data.products;
      } else if (res.data.data && Array.isArray(res.data.data)) {
        productsList = res.data.data;
      }

      if (productsList.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of productsList) {
        try {
          await syncSingleProduct(tenantId, product, sham, settings);
          totalSynced++;
        } catch (pErr) {
          await db.addLog(tenantId, 'WARN', 'PRODUCT', `SKU ${product.sku || product.name} bo'lgan tovar sinxronlanmadi`, pErr.message);
        }
      }

      if (productsList.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    const nowUtc = new Date().toISOString();
    await db.updateSettings(tenantId, { last_products_sync: nowUtc });
    await db.addLog(tenantId, 'INFO', 'PRODUCT', `Tovarlar sinxronizatsiyasi yakunlandi. Sinxronlashtirildi: ${totalSynced} ta tovar.`);
    return { success: true, count: totalSynced };
  } catch (err) {
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    await db.addLog(tenantId, 'ERROR', 'PRODUCT', 'Tovarlar sinxronizatsiyasi muvaffaqiyatsiz tugadi', errMsg);
    throw err;
  }
}

async function syncSingleProduct(tenantId, billzProduct, shamClient, settings) {
  const existingMapping = await db.getSyncedEntity(tenantId, 'product', billzProduct.id);
  
  // 1. Resolve Category ID dynamically (creating it if it does not exist)
  let categoryId = "1";
  try {
    const catRes = await shamClient.get('/api/category');
    const categoriesList = catRes.data.result || catRes.data.data || catRes.data || [];
    
    const billzCategory = billzProduct.categories && billzProduct.categories[0];
    const billzCategoryName = billzCategory ? billzCategory.name : null;
    
    if (billzCategoryName) {
      // Look for match (case-insensitive)
      const match = categoriesList.find(c => c.name && c.name.toLowerCase() === billzCategoryName.toLowerCase());
      if (match) {
        categoryId = match.id.toString();
      } else {
        // Create new category
        const createRes = await shamClient.post('/api/category', {
          name: billzCategoryName,
          display_type: "b",
          has_price_characteristics: "0",
          is_parent: "1",
          organization_id: settings.organization_id.toString(),
          sales_funnel_id: settings.sales_funnel_id.toString()
        });
        const newCatId = createRes.data.id || (createRes.data.result && createRes.data.result.id);
        if (newCatId) {
          categoryId = newCatId.toString();
        }
      }
    } else {
      // Fallback to first category if product has no category
      if (Array.isArray(categoriesList) && categoriesList.length > 0) {
        categoryId = categoriesList[0].id.toString();
      }
    }
  } catch (cErr) {
    console.warn('Failed to resolve/create category for product sync, defaulting to 1:', cErr.message);
  }

  // 2. Resolve Unit ID dynamically (create default unit if missing)
  let unitId = "1";
  try {
    const unitRes = await shamClient.get('/api/unit');
    const unitsList = unitRes.data.result || unitRes.data.data || unitRes.data || [];
    if (Array.isArray(unitsList) && unitsList.length > 0) {
      unitId = unitsList[0].id.toString();
    } else {
      // Create default unit 'шт'
      const createUnitRes = await shamClient.post('/api/unit', { name: 'шт' });
      const newUnitId = createUnitRes.data.id || (createUnitRes.data.result && createUnitRes.data.result.id);
      if (newUnitId) {
        unitId = newUnitId.toString();
      }
    }
  } catch (uErr) {
    console.warn('Failed to resolve/create unit for product sync, defaulting to 1:', uErr.message);
  }
  
  const basePrice = billzProduct.shop_prices && billzProduct.shop_prices[0] 
    ? billzProduct.shop_prices[0].retail_price 
    : 0;

  // Pass empty variants array to bypass Laravel validation on variant_attributes.
  // ShamCRM automatically creates a default variant in the database which we fetch and update later.
  const payload = {
    name: billzProduct.name,
    category_id: categoryId,
    description: billzProduct.description || billzProduct.brand_name || 'Imported from Billz',
    unit_id: unitId,
    is_active: "1",
    is_popular: "0",
    is_new: "0",
    is_sale: "0",
    is_service: "0",
    price: basePrice ? parseFloat(basePrice).toFixed(4) : "0.0000",
    attributes: [],
    variants: [],
    organization_id: settings.organization_id.toString()
  };

  let shamProductId;
  if (existingMapping) {
    try {
      await shamClient.post(`/api/good/${existingMapping.shamcrm_id}`, {
        ...payload,
        sales_funnel_id: settings.sales_funnel_id.toString()
      });
      shamProductId = existingMapping.shamcrm_id;
    } catch (uErr) {
      if (uErr.response && uErr.response.status === 404) {
        const res = await shamClient.post('/api/good', payload);
        shamProductId = res.data.id || (res.data.data && res.data.data.id) || (res.data.result && res.data.result.id);
        await db.saveSyncedEntity(tenantId, 'product', billzProduct.id, shamProductId.toString());
      } else {
        throw uErr;
      }
    }
  } else {
    const res = await shamClient.post('/api/good', payload);
    shamProductId = res.data.id || (res.data.data && res.data.data.id) || (res.data.result && res.data.result.id);
    if (!shamProductId) {
      throw new Error('ShamCRM did not return Good ID upon creation: ' + JSON.stringify(res.data));
    }
    await db.saveSyncedEntity(tenantId, 'product', billzProduct.id, shamProductId.toString());
  }

  const shopStocks = billzProduct.shop_measurement_values || [];
  const mappings = await db.getMappings(tenantId, 'shop');

  let goodVariantId;
  const goodDetails = await shamClient.get(`/api/good/${shamProductId}`);
  const shamVariants = goodDetails.data.variants || (goodDetails.data.data && goodDetails.data.data.variants) || (goodDetails.data.result && goodDetails.data.result.variants) || [];
  if (shamVariants.length > 0) {
    goodVariantId = shamVariants[0].id;
  }

  if (goodVariantId) {
    for (const stock of shopStocks) {
      const mappedShop = mappings.find(m => m.billz_id === stock.shop_id);
      if (mappedShop && mappedShop.shamcrm_id) {
        await shamClient.post('/api/good-initial-balance/set-remainder', {
          data: [
            {
              good_variant_id: parseInt(goodVariantId),
              supplier_id: 1,
              price: parseFloat(basePrice) || 0,
              quantity: parseFloat(stock.active_measurement_value) || 0,
              unit_id: 1,
              storage_id: parseInt(mappedShop.shamcrm_id),
              date: null
            }
          ],
          organization_id: settings.organization_id.toString(),
          sales_funnel_id: settings.sales_funnel_id.toString()
        });
      }
    }
  }
}

// 4. Clients Synchronization
async function syncClients(tenantId) {
  try {
    await db.addLog(tenantId, 'INFO', 'CLIENT', 'Mijozlar sinxronizatsiyasi boshlandi...');
    const billz = await getBillzClient(tenantId);
    const sham = await getShamCRMClient(tenantId);
    const settings = await db.getSettings(tenantId);

    const res = await billz.get('/v1/client');
    let clientsList = [];
    if (res.data && res.data.clients) {
      clientsList = res.data.clients;
    } else if (Array.isArray(res.data)) {
      clientsList = res.data;
    }

    let totalSynced = 0;
    for (const client of clientsList) {
      try {
        const existingMapping = await db.getSyncedEntity(tenantId, 'client', client.id);
        const phone = client.phone_numbers && client.phone_numbers[0] ? client.phone_numbers[0] : '';
        
        const payload = {
          name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'No Name',
          phone: phone,
          lead_status_id: 1,
          organization_id: settings.organization_id,
          manager_id: 1,
          email: client.email || '',
          source_id: 1
        };

        let shamClientId;
        if (existingMapping) {
          try {
            await sham.post(`/api/lead/${existingMapping.shamcrm_id}`, payload);
            shamClientId = existingMapping.shamcrm_id;
          } catch (uErr) {
            if (uErr.response && uErr.response.status === 404) {
              const cRes = await sham.post('/api/lead', payload);
              shamClientId = cRes.data.id || cRes.data.data.id || (cRes.data.result && cRes.data.result.id);
              await db.saveSyncedEntity(tenantId, 'client', client.id, shamClientId.toString());
            } else {
              throw uErr;
            }
          }
        } else {
          const cRes = await sham.post('/api/lead', payload);
          shamClientId = cRes.data.id || (cRes.data.data && cRes.data.data.id) || (cRes.data.result && cRes.data.result.id);
          if (!shamClientId) {
            throw new Error('ShamCRM did not return Lead ID upon creation: ' + JSON.stringify(cRes.data));
          }
          await db.saveSyncedEntity(tenantId, 'client', client.id, shamClientId.toString());
        }
        totalSynced++;
      } catch (cErr) {
        await db.addLog(tenantId, 'WARN', 'CLIENT', `Mijozni sinxronlashda xatolik: ${client.first_name || ''} ${client.last_name || ''}`, cErr.message);
      }
    }

    const nowUtc = new Date().toISOString();
    await db.updateSettings(tenantId, { last_clients_sync: nowUtc });
    await db.addLog(tenantId, 'INFO', 'CLIENT', `Mijozlar sinxronizatsiyasi yakunlandi. Sinxronlashtirildi: ${totalSynced} ta mijoz.`);
    return { success: true, count: totalSynced };
  } catch (err) {
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    await db.addLog(tenantId, 'ERROR', 'CLIENT', 'Mijozlar sinxronizatsiyasi muvaffaqiyatsiz tugadi', errMsg);
    throw err;
  }
}

// 5. Cash Register / Sales Synchronization
async function syncCashbox(tenantId) {
  try {
    await db.addLog(tenantId, 'INFO', 'CASHBOX', 'Kassa smenalari va savdo to\'lovlari sinxronizatsiyasi boshlandi...');
    const billz = await getBillzClient(tenantId);
    const sham = await getShamCRMClient(tenantId);
    const settings = await db.getSettings(tenantId);

    const today = new Date();
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    const res = await billz.get(`/v3/order-search?start_date=${startDate}&end_date=${endDate}&limit=100&page=1`);
    
    let ordersList = [];
    if (res.data && res.data.orders_sorted_by_date_list) {
      for (const dateGroup of res.data.orders_sorted_by_date_list) {
        if (Array.isArray(dateGroup.orders)) {
          ordersList.push(...dateGroup.orders);
        }
      }
    } else if (res.data && Array.isArray(res.data.orders)) {
      ordersList = res.data.orders;
    }

    let totalSynced = 0;
    const mappings = await db.getMappings(tenantId, 'cashbox');

    for (const order of ordersList) {
      try {
        const orderId = order.id;
        const existingMapping = await db.getSyncedEntity(tenantId, 'payment', orderId);
        if (existingMapping) {
          continue;
        }

        const details = order.order_detail || {};
        const billzCashboxId = details.cashbox_id;
        if (!billzCashboxId) continue;
        
        const mappedCashRegister = mappings.find(m => m.billz_id === billzCashboxId);
        
        if (!mappedCashRegister || !mappedCashRegister.shamcrm_id) {
          await db.addLog(tenantId, 'WARN', 'CASHBOX', `Buyurtma ${order.order_number || orderId} o'tkazib yuborildi: ${details.cashbox_name || billzCashboxId} kassasi ShamCRM kassa reestriga moslashtirilmagan.`);
          continue;
        }

        let shamLeadId = 38;
        const billzCustomerId = details.customer ? details.customer.id : null;
        if (billzCustomerId) {
          const clientMapping = await db.getSyncedEntity(tenantId, 'client', billzCustomerId);
          if (clientMapping) {
            shamLeadId = parseInt(clientMapping.shamcrm_id);
          }
        }

        const dateStr = details.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        const payload = {
          date: dateStr,
          amount: parseFloat(details.total_price) || 0,
          operation_type: 'client_payment',
          movement_type: 'PKO',
          lead_id: shamLeadId,
          cash_register_id: parseInt(mappedCashRegister.shamcrm_id),
          comment: `Billz Order #${order.order_number || ''}`,
          approved: true,
          organization_id: settings.organization_id.toString(),
          sales_funnel_id: settings.sales_funnel_id.toString()
        };

        const payRes = await sham.post(`/api/checking-account?organization_id=${settings.organization_id}`, payload);
        const shamPaymentId = payRes.data.id || (payRes.data.data && payRes.data.data.id) || (payRes.data.result && payRes.data.result.id);
        
        if (shamPaymentId) {
          await db.saveSyncedEntity(tenantId, 'payment', orderId, shamPaymentId.toString());
          totalSynced++;
        }
      } catch (oErr) {
        await db.addLog(tenantId, 'WARN', 'CASHBOX', `Buyurtmani sinxronlashda xatolik: ${order.order_number || order.id}`, oErr.message);
      }
    }

    const nowUtc = new Date().toISOString();
    await db.updateSettings(tenantId, { last_cashbox_sync: nowUtc });
    await db.addLog(tenantId, 'INFO', 'CASHBOX', `Kassa va savdo sinxronizatsiyasi yakunlandi. Sinxronlashtirildi: ${totalSynced} ta tranzaksiya.`);
    return { success: true, count: totalSynced };
  } catch (err) {
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    await db.addLog(tenantId, 'ERROR', 'CASHBOX', 'Kassa sinxronizatsiyasi muvaffaqiyatsiz tugadi', errMsg);
    throw err;
  }
}

// 6. Manual testing connector to dynamically discover Shops and Cashboxes from Billz for Mapping
async function fetchBillzMappingEntities(tenantId) {
  try {
    const billz = await getBillzClient(tenantId);
    
    // Discover Shops from Product List
    const shopsMap = new Map();
    try {
      const productsRes = await billz.get('/v2/products?limit=100');
      let productsList = productsRes.data.products || productsRes.data.data || (Array.isArray(productsRes.data) ? productsRes.data : []);
      for (const p of productsList) {
        const shopStocks = p.shop_measurement_values || [];
        for (const stock of shopStocks) {
          if (stock.shop_id) {
            shopsMap.set(stock.shop_id, stock.shop_name || 'Shop');
          }
        }
      }
    } catch (pErr) {
      console.warn('Failed to extract shops from products:', pErr.message);
    }

    // Discover Cashboxes and Shops from Orders List
    const cashboxesMap = new Map();
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      const ordersRes = await billz.get(`/v3/order-search?start_date=${startDate}&end_date=${endDate}&limit=100`);
      
      let ordersList = [];
      if (ordersRes.data && ordersRes.data.orders_sorted_by_date_list) {
        for (const dateGroup of ordersRes.data.orders_sorted_by_date_list) {
          if (Array.isArray(dateGroup.orders)) {
            ordersList.push(...dateGroup.orders);
          }
        }
      }
      
      for (const order of ordersList) {
        const details = order.order_detail || {};
        if (details.cashbox_id) {
          cashboxesMap.set(details.cashbox_id, details.cashbox_name || 'Cashbox');
        }
        if (details.shop_id) {
          const shopName = details.shop ? details.shop.name : 'Shop';
          shopsMap.set(details.shop_id, shopName);
        }
      }
    } catch (oErr) {
      console.warn('Failed to extract cashboxes from orders:', oErr.message);
    }

    // Discover ShamCRM Storages and Cash Registers for automatic mapping
    let shamStorages = [];
    let shamCashboxes = [];
    try {
      const settings = await db.getSettings(tenantId);
      if (settings && settings.shamcrm_url && settings.shamcrm_token && settings.shamcrm_url !== 'http://localhost') {
        const sham = axios.create({
          baseURL: settings.shamcrm_url,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${settings.shamcrm_token}`
          }
        });
        
        try {
          const resStorage = await sham.get('/api/storage');
          const sData = resStorage.data.data || resStorage.data || [];
          if (Array.isArray(sData)) shamStorages = sData;
        } catch (sErr) {
          console.warn('Failed to fetch ShamCRM storages for auto-mapping:', sErr.message);
        }

        try {
          const resCash = await sham.get('/api/initial-balance/get/cash-registers');
          const cData = resCash.data.data || resCash.data || [];
          if (Array.isArray(cData)) shamCashboxes = cData;
        } catch (cErr) {
          console.warn('Failed to fetch ShamCRM cash registers for auto-mapping:', cErr.message);
        }
      }
    } catch (dbErr) {
      console.warn('Could not fetch ShamCRM settings for auto-mapping:', dbErr.message);
    }

    // Save/update mapped names in SQLite
    const existingMappings = await db.getMappings(tenantId, 'shop');
    for (const [shopId, shopName] of shopsMap.entries()) {
      const existing = existingMappings.find(m => m.billz_id === shopId);
      let targetId = existing ? existing.shamcrm_id : '';
      let targetName = existing ? existing.shamcrm_name : '';
      
      if (!targetId && shamStorages.length > 0) {
        // Try to match by name (case-insensitive)
        const match = shamStorages.find(s => 
          s.name.toLowerCase().includes(shopName.toLowerCase()) || 
          shopName.toLowerCase().includes(s.name.toLowerCase())
        );
        if (match) {
          targetId = match.id.toString();
          targetName = match.name;
        } else {
          // Fallback to first available storage
          targetId = shamStorages[0].id.toString();
          targetName = shamStorages[0].name;
        }
      }
      
      await db.saveMapping(tenantId, 'shop', shopId, shopName, targetId, targetName);
    }

    const existingCashboxMappings = await db.getMappings(tenantId, 'cashbox');
    for (const [cbId, cbName] of cashboxesMap.entries()) {
      const existing = existingCashboxMappings.find(m => m.billz_id === cbId);
      let targetId = existing ? existing.shamcrm_id : '';
      let targetName = existing ? existing.shamcrm_name : '';
      
      if (!targetId && shamCashboxes.length > 0) {
        // Try to match by name (case-insensitive)
        const match = shamCashboxes.find(c => 
          c.name.toLowerCase().includes(cbName.toLowerCase()) || 
          cbName.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) {
          targetId = match.id.toString();
          targetName = match.name;
        } else {
          // Fallback to first available cash register
          targetId = shamCashboxes[0].id.toString();
          targetName = shamCashboxes[0].name;
        }
      }
      
      await db.saveMapping(tenantId, 'cashbox', cbId, cbName, targetId, targetName);
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to discover Billz entities for mapping:', err.message);
    throw err;
  }
}

module.exports = {
  syncProducts,
  syncClients,
  syncCashbox,
  fetchBillzMappingEntities
};

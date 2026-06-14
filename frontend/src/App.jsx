import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Layers, 
  Terminal, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  ShoppingBag, 
  Users as UsersIcon, 
  CreditCard,
  Play,
  Trash2,
  Database,
  Plus,
  UserCheck
} from 'lucide-react';

const API_BASE = '/api'; // Relative URL, proxied locally and resolved directly on Vercel

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  
  const [settings, setSettings] = useState({
    billz_secret: '',
    shamcrm_url: 'http://localhost',
    shamcrm_token: '',
    sync_interval: 15,
    organization_id: 1,
    sales_funnel_id: 1,
    sync_products_active: 1,
    sync_clients_active: 1,
    sync_cashbox_active: 1,
    last_products_sync: null,
    last_clients_sync: null,
    last_cashbox_sync: null
  });
  const [mappings, setMappings] = useState([]);
  const [shamcrmOptions, setShamcrmOptions] = useState({ storages: [], cashboxes: [] });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncState, setSyncState] = useState({
    products: false,
    clients: false,
    cashbox: false,
    fetchingMappings: false
  });
  const [message, setMessage] = useState(null);

  // Fetch tenants list on load
  useEffect(() => {
    fetchTenants();
  }, []);

  // Fetch settings, mappings, and logs when selected tenant changes
  useEffect(() => {
    if (selectedTenantId) {
      fetchSettings();
      fetchMappings();
      fetchLogs();
      fetchShamcrmOptions();
    }
  }, [selectedTenantId]);

  const fetchShamcrmOptions = async () => {
    if (!selectedTenantId) return;
    try {
      const res = await fetch(`${API_BASE}/shamcrm/options?tenantId=${selectedTenantId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setShamcrmOptions(data.data);
      } else {
        setShamcrmOptions({ storages: [], cashboxes: [] });
      }
    } catch (err) {
      console.error('Error fetching shamcrm options:', err);
      setShamcrmOptions({ storages: [], cashboxes: [] });
    }
  };

  // Poll logs every 10 seconds
  useEffect(() => {
    if (!selectedTenantId) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [selectedTenantId]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch(`${API_BASE}/tenants`);
      const data = await res.json();
      if (data.success && data.data) {
        setTenants(data.data);
        if (data.data.length > 0 && !selectedTenantId) {
          setSelectedTenantId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!newTenantName || !newTenantSlug) return;
    
    try {
      const res = await fetch(`${API_BASE}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTenantName, slug: newTenantSlug })
      });
      const data = await res.json();
      if (data.success) {
        showMessage(`"${newTenantName}" mijoz integratsiyasi muvaffaqiyatli qo'shildi.`);
        setNewTenantName('');
        setNewTenantSlug('');
        setShowAddTenantModal(false);
        
        await fetchTenants();
        if (data.data && data.data.id) {
          setSelectedTenantId(data.data.id);
        }
      } else {
        showMessage(data.error || 'Mijoz yaratishda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Mijoz yaratishda tarmoq xatoligi', 'error');
    }
  };

  const handleDeleteTenant = async () => {
    const tenantName = tenants.find(t => t.id === parseInt(selectedTenantId))?.name || 'ushbu mijoz';
    if (!window.confirm(`DIQQAT: "${tenantName}" mijoz integratsiyasini butunlay o'chirib tashlamoqchimisiz? Bunda barcha sozlamalar, moslashtirishlar va jurnallar o'chib ketadi.`)) return;

    try {
      const res = await fetch(`${API_BASE}/tenants/${selectedTenantId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showMessage('Mijoz integratsiyasi o\'chirildi.');
        setSelectedTenantId('');
        fetchTenants();
      } else {
        showMessage(data.error || 'Mijozni o\'chirishda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Tarmoq xatoligi yuz berdi', 'error');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings?tenantId=${selectedTenantId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSettings(data.data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchMappings = async () => {
    try {
      const res = await fetch(`${API_BASE}/mappings?tenantId=${selectedTenantId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setMappings(data.data);
      }
    } catch (err) {
      console.error('Error fetching mappings:', err);
    }
  };

  const fetchLogs = async () => {
    if (!selectedTenantId) return;
    try {
      const res = await fetch(`${API_BASE}/logs?tenantId=${selectedTenantId}&limit=50`);
      const data = await res.json();
      if (data.success && data.data) {
        setLogs(data.data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings?tenantId=${selectedTenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        showMessage('Sozlamalar muvaffaqiyatli saqlandi!');
        fetchSettings();
        fetchShamcrmOptions();
      } else {
        showMessage(data.error || 'Sozlamalarni saqlashda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Sozlamalarni saqlashda tarmoq xatoligi', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMapping = async (mapping) => {
    try {
      const res = await fetch(`${API_BASE}/mappings?tenantId=${selectedTenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping)
      });
      const data = await res.json();
      if (data.success) {
        showMessage('Moslashtirish saqlandi!');
        fetchMappings();
      } else {
        showMessage(data.error || 'Moslashtirishni saqlashda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Tarmoq xatoligi yuz berdi', 'error');
    }
  };

  const triggerManualSync = async (type) => {
    setSyncState(prev => ({ ...prev, [type]: true }));
    try {
      const res = await fetch(`${API_BASE}/sync/${type}?tenantId=${selectedTenantId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showMessage(`${type === 'products' ? 'Tovarlar' : type === 'clients' ? 'Mijozlar' : 'Kassa'} sinxronizatsiyasi fonda boshlandi!`);
        setTimeout(() => {
          fetchLogs();
          fetchSettings();
        }, 1500);
      } else {
        showMessage(data.error || 'Sinxronizatsiyani ishga tushirishda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Tarmoq xatoligi yuz berdi', 'error');
    } finally {
      setSyncState(prev => ({ ...prev, [type]: false }));
    }
  };

  const fetchMappingsFromBillz = async () => {
    setSyncState(prev => ({ ...prev, fetchingMappings: true }));
    try {
      const res = await fetch(`${API_BASE}/sync/fetch-mappings?tenantId=${selectedTenantId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showMessage('Do\'kon va kassalar Billz tizimidan yuklab olindi!');
        fetchMappings();
      } else {
        showMessage(data.error || 'Ma\'lumotlarni yuklashda xatolik', 'error');
      }
    } catch (err) {
      showMessage('Tarmoq xatoligi yuz berdi', 'error');
    } finally {
      setSyncState(prev => ({ ...prev, fetchingMappings: false }));
    }
  };

  const clearAllLogs = async () => {
    if (!window.confirm('Haqiqatdan ham ushbu mijoz uchun barcha jurnallarni o\'chirmoqchimisiz?')) return;
    try {
      const res = await fetch(`${API_BASE}/logs?tenantId=${selectedTenantId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage('Jurnallar tozalandi.');
        setLogs([]);
      }
    } catch (err) {
      showMessage('Jurnallarni tozalashda xatolik', 'error');
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Toast Messages */}
      {message && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          padding: '16px 24px',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          background: message.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
          color: '#ffffff',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 500,
        }}>
          {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Floating Header */}
      <header className="glass-panel" style={{
        margin: '20px',
        padding: '20px 30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            padding: '12px',
            borderRadius: '12px',
            color: '#0b0f19'
          }}>
            <Database size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem' }}>Billz va ShamCRM SaaS Paneli</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ko'p foydalanuvchili tovarlar, omborlar, mijozlar va kassa sinxronizatsiyasi</p>
          </div>
        </div>

        {/* Multi-Tenant Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Faol mijoz:</span>
            <select 
              value={selectedTenantId} 
              onChange={(e) => setSelectedTenantId(e.target.value)}
              style={{ padding: '4px', width: 'auto', border: 'none', background: 'transparent', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-color)', cursor: 'pointer' }}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id} style={{ background: '#0b0f19', color: '#ffffff' }}>{t.name}</option>
              ))}
            </select>
          </div>

          <button className="btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setShowAddTenantModal(true)}>
            <Plus size={16} />
            <span>Mijoz qo'shish</span>
          </button>
          
          {tenants.length > 1 && (
            <button className="btn-danger" style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: 'var(--error-color)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={handleDeleteTenant}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Add Tenant Modal */}
      {showAddTenantModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div className="glass-panel" style={{ padding: '30px', width: '450px', background: '#0b0f19' }}>
            <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={20} color="var(--accent-color)" />
              <span>Yangi mijoz integratsiyasini yaratish</span>
            </h3>
            <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Mijoz nomi</label>
                <input 
                  type="text" 
                  placeholder="Masalan: Nike Uzbekistan" 
                  value={newTenantName}
                  onChange={(e) => {
                    setNewTenantName(e.target.value);
                    setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  required
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>URL havola (unikal slug)</label>
                <input 
                  type="text" 
                  placeholder="Masalan: nike-uz" 
                  value={newTenantSlug}
                  onChange={(e) => setNewTenantSlug(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddTenantModal(false)}>Bekor qilish</button>
                <button type="submit" className="btn-primary">Integratsiyani yaratish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs-container" style={{ margin: '0 20px 20px 20px' }}>
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <ShoppingBag size={18} />
          <span>Boshqaruv paneli</span>
        </button>
        <button className={`tab-btn ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveTab('mappings')}>
          <Layers size={18} />
          <span>Moslashtirish (Mapping)</span>
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <SettingsIcon size={18} />
          <span>Sozlamalar</span>
        </button>
        <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          <Terminal size={18} />
          <span>Sinxronizatsiya jurnali</span>
        </button>
      </div>

      {/* Main Bento Contents */}
      <main style={{ padding: '0 20px' }}>
        {!selectedTenantId ? (
          <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <AlertCircle size={40} style={{ margin: '0 auto 15px auto', color: 'var(--accent-color)' }} />
            <h3>Mijoz tanlanmagan</h3>
            <p style={{ marginTop: '5px' }}>Sozlashni boshlash uchun mijozni tanlang yoki yangisini yarating.</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="bento-grid" style={{ padding: 0 }}>
                {/* Sync Status Bento Item */}
                <section className="glass-panel" style={{ gridColumn: 'span 8', padding: '30px' }}>
                  <h2 style={{ marginBottom: '20px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={20} color="var(--accent-color)" />
                    <span>Sinxronizatsiya modullari</span>
                  </h2>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Products Module */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ShoppingBag size={18} color="var(--accent-color)" />
                          <span>Tovarlar va ombor qoldiqlari</span>
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Oxirgi sinxronizatsiya: {settings.last_products_sync ? new Date(settings.last_products_sync).toLocaleString() : 'Hech qachon'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span className={`badge ${settings.sync_products_active ? 'badge-success' : 'badge-error'}`}>
                          {settings.sync_products_active ? 'Avto-sinxronlash faol' : 'Avto-sinxronlash o\'chirilgan'}
                        </span>
                        <button className="btn-primary" disabled={syncState.products} onClick={() => triggerManualSync('products')}>
                          {syncState.products ? <RefreshCw size={16} className="shimmer-bg" /> : <Play size={16} />}
                          <span>Hozir sinxronlash</span>
                        </button>
                      </div>
                    </div>

                    {/* Clients Module */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UsersIcon size={18} color="var(--accent-color)" />
                          <span>Mijozlar (Leadlar)</span>
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Oxirgi sinxronizatsiya: {settings.last_clients_sync ? new Date(settings.last_clients_sync).toLocaleString() : 'Hech qachon'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span className={`badge ${settings.sync_clients_active ? 'badge-success' : 'badge-error'}`}>
                          {settings.sync_clients_active ? 'Avto-sinxronlash faol' : 'Avto-sinxronlash o\'chirilgan'}
                        </span>
                        <button className="btn-primary" disabled={syncState.clients} onClick={() => triggerManualSync('clients')}>
                          {syncState.clients ? <RefreshCw size={16} className="shimmer-bg" /> : <Play size={16} />}
                          <span>Hozir sinxronlash</span>
                        </button>
                      </div>
                    </div>

                    {/* Cashbox Module */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CreditCard size={18} color="var(--accent-color)" />
                          <span>Kassa smena to'lovlari (Kirim orderlari)</span>
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Oxirgi sinxronizatsiya: {settings.last_cashbox_sync ? new Date(settings.last_cashbox_sync).toLocaleString() : 'Hech qachon'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span className={`badge ${settings.sync_cashbox_active ? 'badge-success' : 'badge-error'}`}>
                          {settings.sync_cashbox_active ? 'Avto-sinxronlash faol' : 'Avto-sinxronlash o\'chirilgan'}
                        </span>
                        <button className="btn-primary" disabled={syncState.cashbox} onClick={() => triggerManualSync('cashbox')}>
                          {syncState.cashbox ? <RefreshCw size={16} className="shimmer-bg" /> : <Play size={16} />}
                          <span>Hozir sinxronlash</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Quick Stats Bento Item */}
                <section className="glass-panel" style={{ gridColumn: 'span 4', padding: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Ulanish tafsilotlari</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Billz Host</span>
                        <span style={{ fontWeight: 500 }}>api-admin.billz.ai</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>ShamCRM API</span>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', whiteSpace: 'nowrap' }}>
                          {settings.shamcrm_url}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Oraliq vaqt</span>
                        <span style={{ fontWeight: 500 }}>Har {settings.sync_interval} daqiqada</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Tashkilot IDsi</span>
                        <span style={{ fontWeight: 500 }}>{settings.organization_id}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '30px', padding: '16px', background: 'rgba(245,158,11,0.05)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.1)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 500 }}>Bilasizmi?</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Tizim faqat o'zgargan tovarlar va ma'lumotlarni qidiradi hamda tarmoq yukini kamaytirish uchun faqat o'zgarishlarni sinxronizatsiya qiladi.
                    </p>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'mappings' && (
              <div className="glass-panel" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem' }}>Moslashtirish sozlamalari (Mapping)</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Ombor qoldiqlari va kassa pullari to'g'ri integratsiya qilinishi uchun Billz do'konlari hamda kassalarini ShamCRM moslamalari bilan moslashtiring.
                    </p>
                  </div>
                  <button className="btn-secondary" disabled={syncState.fetchingMappings} onClick={fetchMappingsFromBillz}>
                    {syncState.fetchingMappings ? <RefreshCw size={16} className="shimmer-bg" /> : <RefreshCw size={16} />}
                    <span>Do'kon va kassalarni yuklash</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                  {/* Shops Mappings */}
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShoppingBag size={18} color="var(--accent-color)" />
                      <span>Do'konlarni omborlarga moslashtirish</span>
                    </h3>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <tr>
                            <th style={{ padding: '12px' }}>Billz do'koni</th>
                            <th style={{ padding: '12px' }}>ShamCRM ombor IDsi</th>
                            <th style={{ padding: '12px', textAlign: 'center' }}>Amal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappings.filter(m => m.type === 'shop').map(m => (
                            <tr key={m.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 500 }}>{m.billz_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {m.billz_id}</div>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {shamcrmOptions.storages.length > 0 ? (
                                  <select
                                    value={m.shamcrm_id || ''}
                                    onChange={(e) => {
                                      const newMappings = [...mappings];
                                      const index = newMappings.findIndex(x => x.id === m.id);
                                      const selectedStorage = shamcrmOptions.storages.find(s => s.id.toString() === e.target.value);
                                      newMappings[index].shamcrm_id = e.target.value;
                                      newMappings[index].shamcrm_name = selectedStorage ? selectedStorage.name : '';
                                      setMappings(newMappings);
                                    }}
                                    style={{ padding: '8px', fontSize: '0.85rem', width: '100%', background: 'rgba(15, 23, 42, 0.6)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                  >
                                    <option value="">-- Ombor tanlang --</option>
                                    {shamcrmOptions.storages.map(s => (
                                      <option key={s.id} value={s.id} style={{ background: '#0b0f19' }}>{s.name} (ID: {s.id})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input 
                                    type="text" 
                                    placeholder="Masalan: 1" 
                                    style={{ padding: '8px', fontSize: '0.85rem' }}
                                    value={m.shamcrm_id || ''}
                                    onChange={(e) => {
                                      const newMappings = [...mappings];
                                      const index = newMappings.findIndex(x => x.id === m.id);
                                      newMappings[index].shamcrm_id = e.target.value;
                                      setMappings(newMappings);
                                    }}
                                  />
                                )}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleSaveMapping(m)}>
                                  Saqlash
                                </button>
                              </td>
                            </tr>
                          ))}
                          {mappings.filter(m => m.type === 'shop').length === 0 && (
                            <tr>
                              <td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                Moslashtirishlar topilmadi. Variantlarni ko'rish uchun "Do'kon va kassalarni yuklash" tugmasini bosing.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Cashboxes Mappings */}
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={18} color="var(--accent-color)" />
                      <span>Kassalarni kassa reestriga moslashtirish</span>
                    </h3>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <tr>
                            <th style={{ padding: '12px' }}>Billz kassasi</th>
                            <th style={{ padding: '12px' }}>ShamCRM kassa IDsi</th>
                            <th style={{ padding: '12px', textAlign: 'center' }}>Amal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappings.filter(m => m.type === 'cashbox').map(m => (
                            <tr key={m.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 500 }}>{m.billz_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {m.billz_id}</div>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {shamcrmOptions.cashboxes.length > 0 ? (
                                  <select
                                    value={m.shamcrm_id || ''}
                                    onChange={(e) => {
                                      const newMappings = [...mappings];
                                      const index = newMappings.findIndex(x => x.id === m.id);
                                      const selectedCash = shamcrmOptions.cashboxes.find(c => c.id.toString() === e.target.value);
                                      newMappings[index].shamcrm_id = e.target.value;
                                      newMappings[index].shamcrm_name = selectedCash ? selectedCash.name : '';
                                      setMappings(newMappings);
                                    }}
                                    style={{ padding: '8px', fontSize: '0.85rem', width: '100%', background: 'rgba(15, 23, 42, 0.6)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                  >
                                    <option value="">-- Kassani tanlang --</option>
                                    {shamcrmOptions.cashboxes.map(c => (
                                      <option key={c.id} value={c.id} style={{ background: '#0b0f19' }}>{c.name} (ID: {c.id})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input 
                                    type="text" 
                                    placeholder="Masalan: 1" 
                                    style={{ padding: '8px', fontSize: '0.85rem' }}
                                    value={m.shamcrm_id || ''}
                                    onChange={(e) => {
                                      const newMappings = [...mappings];
                                      const index = newMappings.findIndex(x => x.id === m.id);
                                      newMappings[index].shamcrm_id = e.target.value;
                                      setMappings(newMappings);
                                    }}
                                  />
                                )}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleSaveMapping(m)}>
                                  Saqlash
                                </button>
                              </td>
                            </tr>
                          ))}
                          {mappings.filter(m => m.type === 'cashbox').length === 0 && (
                            <tr>
                              <td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                Moslashtirishlar topilmadi. Variantlarni ko'rish uchun "Do'kon va kassalarni yuklash" tugmasini bosing.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px', margin: '0 auto' }}>
                <h2 style={{ marginBottom: '20px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SettingsIcon size={20} color="var(--accent-color)" />
                  <span>API ma'lumotlari va Sozlamalar</span>
                </h2>

                <form onSubmit={handleSettingsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Billz API maxfiy kaliti (Secret Key)
                      </label>
                      <input 
                        type="password" 
                        placeholder="Secret Key kalitini kiriting" 
                        value={settings.billz_secret || ''}
                        onChange={(e) => setSettings({ ...settings, billz_secret: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Sinxronlash oralig'i (Daqiqa)
                      </label>
                      <input 
                        type="number" 
                        min="1" 
                        value={settings.sync_interval || 15}
                        onChange={(e) => setSettings({ ...settings, sync_interval: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        ShamCRM API manzili (URL)
                      </label>
                      <input 
                        type="text" 
                        placeholder="Masalan: http://crm.domain.com" 
                        value={settings.shamcrm_url || ''}
                        onChange={(e) => setSettings({ ...settings, shamcrm_url: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        ShamCRM Bearer Token
                      </label>
                      <input 
                        type="password" 
                        placeholder="ShamCRM Bearer Tokenini kiriting" 
                        value={settings.shamcrm_token || ''}
                        onChange={(e) => setSettings({ ...settings, shamcrm_token: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        ShamCRM Tashkilot IDsi (organization_id)
                      </label>
                      <input 
                        type="number" 
                        value={settings.organization_id || 1}
                        onChange={(e) => setSettings({ ...settings, organization_id: parseInt(e.target.value) })}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        ShamCRM Voronka IDsi (sales_funnel_id)
                      </label>
                      <input 
                        type="number" 
                        value={settings.sales_funnel_id || 1}
                        onChange={(e) => setSettings({ ...settings, sales_funnel_id: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                  </div>

                  {/* Status toggles */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '15px' }}>Faol sinxronlash modullari</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)' }}
                          checked={settings.sync_products_active === 1}
                          onChange={(e) => setSettings({ ...settings, sync_products_active: e.target.checked ? 1 : 0 })}
                        />
                        <span style={{ fontSize: '0.9rem' }}>Tovarlar va ombor qoldiqlarini avtomatik sinxronlashni yoqish</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)' }}
                          checked={settings.sync_clients_active === 1}
                          onChange={(e) => setSettings({ ...settings, sync_clients_active: e.target.checked ? 1 : 0 })}
                        />
                        <span style={{ fontSize: '0.9rem' }}>Mijozlarni avtomatik sinxronlashni yoqish</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)' }}
                          checked={settings.sync_cashbox_active === 1}
                          onChange={(e) => setSettings({ ...settings, sync_cashbox_active: e.target.checked ? 1 : 0 })}
                        />
                        <span style={{ fontSize: '0.9rem' }}>Kassa to'lovlarini (PKO/RKO) avtomatik sinxronlashni yoqish</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button type="submit" className="btn-primary" disabled={loading}>
                      {loading && <RefreshCw size={16} className="shimmer-bg" />}
                      <span>Sozlamalarni saqlash</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="glass-panel" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem' }}>Sinxronizatsiya va tizim jurnallari</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fonda bajarilgan amaliyotlar tarixi va diagnostika xabarlari.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" onClick={fetchLogs}>
                      <RefreshCw size={16} />
                      <span>Jurnalni yangilash</span>
                    </button>
                    <button className="btn-danger" onClick={clearAllLogs}>
                      <Trash2 size={16} />
                      <span>Jurnallarni tozalash</span>
                    </button>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  maxHeight: '500px',
                  overflowY: 'auto',
                  padding: '10px'
                }}>
                  {logs.map((log) => (
                    <div key={log.id} style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '15px',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </span>

                      <span className={`badge ${
                        log.level === 'ERROR' ? 'badge-error' :
                        log.level === 'WARN' ? 'badge-warn' :
                        'badge-info'
                      }`} style={{ minWidth: '70px', justifyContent: 'center' }}>
                        {log.level}
                      </span>

                      <span className="badge badge-info" style={{ minWidth: '80px', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', color: '#ffffff' }}>
                        {log.type}
                      </span>

                      <div style={{ flexGrow: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.message}</div>
                        {log.details && (
                          <pre style={{
                            marginTop: '6px',
                            padding: '10px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '6px',
                            color: 'var(--text-secondary)',
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
                            {log.details}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}

                  {logs.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Hozircha tizim jurnallari yozilmagan.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;

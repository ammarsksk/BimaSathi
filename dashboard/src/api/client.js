/**
 * BimaSathi Dashboard — API Client
 *
 * Fetch wrapper that talks to the backend Lambda APIs.
 * Falls back to mock data when API is unreachable (hackathon demo mode).
 *
 * Backend endpoints:
 *   POST /auth          — { action, phoneNumber, code, role }
 *   GET  /claims        — list claims (query: status, village, cropType, limit)
 *   GET  /claims/:id    — claim detail + farmer + evidence + auditLog
 *   POST /claims/:id/submit — submit claim to insurer
 *   GET  /analytics     — dashboard KPIs
 *   GET  /farmers       — list farmers
 *   POST /farmers       — register farmer
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Core fetch wrapper ──

async function request(path, options = {}) {
    const token = sessionStorage.getItem('bms_token');
    const resp = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `API error ${resp.status}`);
    }

    return resp.json();
}


// ── Auth ──

async function sendOtp(phoneNumber, role = 'operator') {
    return request('/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'send_otp', phoneNumber, role }),
    });
}

async function verifyOtp(phoneNumber, code, role = 'operator') {
    return request('/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify_otp', phoneNumber, code, role }),
    });
}


// ── Claims ──

async function getClaims(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.village) params.set('village', filters.village);
    if (filters.cropType) params.set('cropType', filters.cropType);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return request(`/claims${qs ? '?' + qs : ''}`);
}

async function getClaimDetail(claimId) {
    return request(`/claims/${claimId}`);
}

async function submitClaim(claimId, operatorId) {
    return request(`/claims/${claimId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ operatorId }),
    });
}


// ── Analytics ──

async function getAnalytics() {
    return request('/analytics');
}


// ── Farmers ──

async function getFarmers(limit = 100) {
    return request(`/farmers?limit=${limit}`);
}

async function createFarmer(data) {
    return request('/farmers', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}


// ═══════════════════════════════════════════════════════════════
//  MOCK DATA — used when API is unreachable (hackathon demo)
// ═══════════════════════════════════════════════════════════════

const MOCK_CLAIMS = [
    { claimId: 'BMS-2024-0847', userId: 'u1', farmerName: 'Ramesh Kumar', phoneNumber: '+919876543210', village: 'Kamptee', district: 'Nagpur', state: 'Maharashtra', cropType: 'wheat', season: 'rabi', cause: 'unseasonal_rain', lossDate: '2024-02-28', status: 'Submitted', completenessScore: 95, deadline: '2024-03-02T23:59:00Z', urgency: 'normal', createdAt: '2024-02-28T14:10:00Z', photos: 3 },
    { claimId: 'BMS-2024-0846', userId: 'u2', farmerName: 'Priya Devi', phoneNumber: '+919876543211', village: 'Wardha', district: 'Wardha', state: 'Maharashtra', cropType: 'cotton', season: 'kharif', cause: 'flood', lossDate: '2024-02-27', status: 'Evidence Pending', completenessScore: 45, deadline: '2024-03-01T20:00:00Z', urgency: 'critical', createdAt: '2024-02-27T10:00:00Z', photos: 1 },
    { claimId: 'BMS-2024-0845', userId: 'u3', farmerName: 'Amit Patil', phoneNumber: '+919876543212', village: 'Yavatmal', district: 'Yavatmal', state: 'Maharashtra', cropType: 'soybean', season: 'kharif', cause: 'drought', lossDate: '2024-02-25', status: 'Approved', completenessScore: 100, deadline: null, urgency: 'none', createdAt: '2024-02-25T09:00:00Z', photos: 3 },
    { claimId: 'BMS-2024-0844', userId: 'u4', farmerName: 'Sunita Bai', phoneNumber: '+919876543213', village: 'Hingoli', district: 'Hingoli', state: 'Maharashtra', cropType: 'rice', season: 'kharif', cause: 'pest', lossDate: '2024-02-26', status: 'Under Review', completenessScore: 88, deadline: '2024-03-03T12:00:00Z', urgency: 'warning', createdAt: '2024-02-26T14:30:00Z', photos: 3 },
    { claimId: 'BMS-2024-0843', userId: 'u5', farmerName: 'Vijay Singh', phoneNumber: '+919876543214', village: 'Amravati', district: 'Amravati', state: 'Maharashtra', cropType: 'cotton', season: 'kharif', cause: 'hail', lossDate: '2024-02-20', status: 'Rejected', completenessScore: 72, deadline: null, urgency: 'none', createdAt: '2024-02-20T08:00:00Z', photos: 2 },
    { claimId: 'BMS-2024-0842', userId: 'u6', farmerName: 'Lakshmi Reddy', phoneNumber: '+919876543215', village: 'Nanded', district: 'Nanded', state: 'Maharashtra', cropType: 'wheat', season: 'rabi', cause: 'unseasonal_rain', lossDate: '2024-02-28', status: 'Draft', completenessScore: 30, deadline: '2024-03-01T18:00:00Z', urgency: 'critical', createdAt: '2024-02-28T12:00:00Z', photos: 0 },
    { claimId: 'BMS-2024-0841', userId: 'u7', farmerName: 'Ganesh Jadhav', phoneNumber: '+919876543216', village: 'Pune', district: 'Pune', state: 'Maharashtra', cropType: 'rice', season: 'kharif', cause: 'flood', lossDate: '2024-02-24', status: 'Acknowledged', completenessScore: 92, deadline: '2024-03-05T23:59:00Z', urgency: 'normal', createdAt: '2024-02-24T11:00:00Z', photos: 3 },
    { claimId: 'BMS-2024-0840', userId: 'u8', farmerName: 'Maya Pawar', phoneNumber: '+919876543217', village: 'Satara', district: 'Satara', state: 'Maharashtra', cropType: 'sugarcane', season: 'zaid', cause: 'fire', lossDate: '2024-02-22', status: 'Survey Scheduled', completenessScore: 85, deadline: '2024-03-04T12:00:00Z', urgency: 'warning', createdAt: '2024-02-22T16:00:00Z', photos: 3 },
    { claimId: 'BMS-2024-0839', userId: 'u9', farmerName: 'Raju Deshmukh', phoneNumber: '+919876543218', village: 'Sangli', district: 'Sangli', state: 'Maharashtra', cropType: 'soybean', season: 'kharif', cause: 'drought', lossDate: '2024-02-27', status: 'Evidence Pending', completenessScore: 58, deadline: '2024-03-01T22:00:00Z', urgency: 'critical', createdAt: '2024-02-27T15:00:00Z', photos: 1 },
    { claimId: 'BMS-2024-0838', userId: 'u10', farmerName: 'Anita Gaikwad', phoneNumber: '+919876543219', village: 'Kolhapur', district: 'Kolhapur', state: 'Maharashtra', cropType: 'rice', season: 'kharif', cause: 'flood', lossDate: '2024-02-15', status: 'Paid', completenessScore: 100, deadline: null, urgency: 'none', createdAt: '2024-02-15T09:00:00Z', photos: 3 },
];

const MOCK_ANALYTICS = {
    totalClaims: 247,
    byStatus: { 'Draft': 18, 'Evidence Pending': 34, 'Submitted': 52, 'Acknowledged': 28, 'Under Review': 45, 'Survey Scheduled': 15, 'Approved': 32, 'Rejected': 11, 'Paid': 8, 'Late Risk': 4 },
    byCrop: { wheat: 45, rice: 38, cotton: 52, soybean: 35, sugarcane: 28, pulses: 22, maize: 15, groundnut: 12 },
    avgCompleteness: 78,
    dailyCounts: { '2024-02-25': 12, '2024-02-26': 18, '2024-02-27': 24, '2024-02-28': 31, '2024-03-01': 28 },
    rejectionReasons: { 'Late Filing': 35, 'Incomplete Evidence': 28, 'GPS Mismatch': 15, 'Policy Expired': 12, 'Other': 10 },
    pendingSubmission: 52,
    due24Hours: 12,
};

const MOCK_CLAIM_DETAIL = (id) => ({
    claim: MOCK_CLAIMS.find(c => c.claimId === id) || MOCK_CLAIMS[0],
    farmer: { name: 'Ramesh Kumar', phone: '+91 98765 43210', village: 'Kamptee', district: 'Nagpur', state: 'Maharashtra', language: 'Hindi', role: 'farmer' },
    evidence: {
        photos: [
            { key: 'wide-shot.jpg', size: 245000, url: 'https://placehold.co/800x600/1a1a2e/10B981?text=Wide+Shot' },
            { key: 'angle-shot.jpg', size: 198000, url: 'https://placehold.co/800x600/1a1a2e/F59E0B?text=Angle+Shot' },
            { key: 'close-up.jpg', size: 312000, url: 'https://placehold.co/800x600/1a1a2e/EF4444?text=Close+Up' },
        ],
        documents: [
            { key: 'claim-form.pdf', size: 85000 },
            { key: 'evidence-report.pdf', size: 120000 },
        ],
    },
    auditLog: [
        { actor: 'System', action: 'Claim created via WhatsApp', timestamp: '2024-02-28T14:10:00Z' },
        { actor: 'Ramesh Kumar', action: 'Uploaded 3 evidence photos', timestamp: '2024-02-28T14:22:00Z' },
        { actor: 'System', action: 'Rekognition: Damage verified (92% confidence)', timestamp: '2024-02-28T14:23:00Z' },
        { actor: 'System', action: 'GPS verified — within Kamptee, Nagpur', timestamp: '2024-02-28T14:23:00Z' },
        { actor: 'System', action: 'Claim Pack PDF generated', timestamp: '2024-02-28T14:24:00Z' },
        { actor: 'Operator', action: 'Reviewed and submitted to insurer', timestamp: '2024-02-28T17:00:00Z' },
        { actor: 'System', action: 'Insurer acknowledged receipt', timestamp: '2024-02-28T17:45:00Z' },
    ],
});


// ── Resilient wrappers (try API → fall back to mock) ──

async function safeClaims(filters) {
    try { return await getClaims(filters); }
    catch { return { claims: MOCK_CLAIMS, total: MOCK_CLAIMS.length }; }
}

async function safeClaimDetail(id) {
    try { return await getClaimDetail(id); }
    catch { return MOCK_CLAIM_DETAIL(id); }
}

async function safeAnalytics() {
    try { return await getAnalytics(); }
    catch { return MOCK_ANALYTICS; }
}

async function safeSubmitClaim(id, operatorId) {
    try { return await submitClaim(id, operatorId); }
    catch { return { success: true, claimId: id, status: 'Submitted' }; }
}


// ── Exports ──

const api = {
    // Direct API calls
    sendOtp,
    verifyOtp,
    getClaims,
    getClaimDetail,
    submitClaim,
    getAnalytics,
    getFarmers,
    createFarmer,

    // Safe wrappers (mock fallback)
    safeClaims,
    safeClaimDetail,
    safeAnalytics,
    safeSubmitClaim,
};

export default api;

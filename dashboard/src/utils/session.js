function normalizePhoneNumber(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const digits = raw.replace(/[^\d]/g, '')
    if (digits.length === 10) return `+91${digits}`
    if (digits.length >= 11 && digits.length <= 13) return `+${digits}`
    return raw.startsWith('+') ? raw : raw
}

function decodeBase64Url(segment) {
    const raw = String(segment || '').replace(/-/g, '+').replace(/_/g, '/')
    if (!raw) return null
    const padded = raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), '=')
    try {
        return JSON.parse(atob(padded))
    } catch {
        return null
    }
}

function extractPhoneFromToken(token) {
    const raw = String(token || '').trim().replace(/^Bearer\s+/i, '')
    if (raw.startsWith('bms-')) {
        const match = raw.match(/^bms-\d+-(.+)$/)
        return normalizePhoneNumber(match?.[1] || '')
    }

    const [, payloadSegment] = raw.split('.')
    const payload = decodeBase64Url(payloadSegment)
    return normalizePhoneNumber(
        payload?.phone_number
        || payload?.username
        || payload?.['cognito:username']
    )
}

export function normalizeOperatorUser(user, token = '') {
    const candidate = user || {}
    const phoneNumber = normalizePhoneNumber(
        candidate.phoneNumber
        || candidate.phone
        || candidate.phone_number
        || candidate.username
        || candidate.attributes?.phone_number
        || extractPhoneFromToken(token)
    )

    return {
        ...candidate,
        phoneNumber,
        name: candidate.name || candidate.fullName || candidate.username || 'Operator',
        role: candidate.role || 'operator',
    }
}

export function normalizeSession(session = {}) {
    return {
        token: session.token || '',
        user: normalizeOperatorUser(session.user, session.token),
    }
}

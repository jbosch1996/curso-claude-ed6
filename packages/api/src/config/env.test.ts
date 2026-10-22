import { describe, it, expect, afterEach, vi } from 'vitest'

const SECRETO_VALIDO = 'a'.repeat(32)

const cargarEnv = async () => {
    vi.resetModules()
    return import('./env.js')
}

describe('config/env JWT_SECRET', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it('en producción falla si no hay JWT_SECRET', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('JWT_SECRET', '')
        await expect(cargarEnv()).rejects.toThrow(/JWT_SECRET/)
    })

    it('en producción falla si el secreto tiene menos de 32 caracteres', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('JWT_SECRET', 'corto')
        await expect(cargarEnv()).rejects.toThrow(/32/)
    })

    it('en producción acepta un secreto válido', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('JWT_SECRET', SECRETO_VALIDO)
        const env = await cargarEnv()
        expect(env.JWT_SECRET).toBe(SECRETO_VALIDO)
    })

    it('en desarrollo sin variable genera un secreto aleatorio y avisa', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('JWT_SECRET', '')
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const primero = (await cargarEnv()).JWT_SECRET
        const segundo = (await cargarEnv()).JWT_SECRET
        expect(primero.length).toBeGreaterThanOrEqual(32)
        expect(primero).not.toBe('super-secret-resttek-key')
        expect(primero).not.toBe(segundo)
        expect(aviso).toHaveBeenCalled()
    })

    it('en desarrollo usa el secreto definido', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('JWT_SECRET', 'mi-secreto-de-desarrollo')
        const env = await cargarEnv()
        expect(env.JWT_SECRET).toBe('mi-secreto-de-desarrollo')
    })

    it('en test nunca usa el secreto público antiguo', async () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('JWT_SECRET', '')
        const env = await cargarEnv()
        expect(env.JWT_SECRET).not.toBe('super-secret-resttek-key')
        expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16)
    })
})

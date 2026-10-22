import { describe, it, expect, beforeEach } from 'vitest'
import { DiscountCodeService } from './discount-code.service.js'
import { MockDiscountCodeRepository } from '@repositories/mocks/MockDiscountCodeRepository.js'
import { DiscountCodeNotFoundError, DuplicatedDiscountCodeError, InvalidDiscountCodeError } from '@errors/DomainErrors.js'

describe('DiscountCodeService', () => {
    let service: DiscountCodeService

    const crear = (restaurantId = 'r1', cambios: Record<string, unknown> = {}) =>
        service.create({ restaurantId, code: 'verano10', type: 'percent', value: 10, ...cambios })

    beforeEach(() => {
        service = new DiscountCodeService(new MockDiscountCodeRepository())
    })

    describe('create', () => {
        it('crea un código normalizado, activo y sin caducidad por defecto', async () => {
            const codigo = await crear()
            expect(codigo).toMatchObject({ restaurantId: 'r1', code: 'VERANO10', type: 'percent', value: 10, expiresAt: null, active: true })
            expect(codigo.id).toBeTruthy()
        })

        it('guarda la caducidad y el estado indicados', async () => {
            const codigo = await crear('r1', { expiresAt: '2026-12-31', active: false })
            expect(codigo).toMatchObject({ expiresAt: '2026-12-31T00:00:00.000Z', active: false })
        })

        it('rechaza un código duplicado en el mismo restaurante, aunque cambien mayúsculas', async () => {
            await crear()
            await expect(crear('r1', { code: ' VERANO10 ' })).rejects.toThrow(DuplicatedDiscountCodeError)
        })

        it('permite el mismo código en otro restaurante', async () => {
            await crear('r1')
            await expect(crear('r2')).resolves.toBeDefined()
        })

        it.each([
            ['código vacío', { code: '' }],
            ['tipo desconocido', { type: 'otro' }],
            ['porcentaje mayor de 100', { value: 101 }],
            ['valor negativo', { value: -1 }],
            ['caducidad inválida', { expiresAt: 'mañana' }],
            ['active no booleano', { active: 'si' }]
        ])('rechaza %s', async (_nombre, cambios) => {
            await expect(crear('r1', cambios)).rejects.toThrow(InvalidDiscountCodeError)
        })
    })

    describe('consultas', () => {
        it('lista solo los códigos del restaurante', async () => {
            await crear('r1')
            await crear('r2')
            expect(await service.findByRestaurantId('r1')).toHaveLength(1)
        })

        it('devuelve un código de su restaurante', async () => {
            const { id } = await crear('r1')
            expect((await service.findById('r1', id)).code).toBe('VERANO10')
        })

        it('trata un código de otro restaurante como inexistente', async () => {
            const { id } = await crear('r1')
            await expect(service.findById('r2', id)).rejects.toThrow(DiscountCodeNotFoundError)
        })
    })

    describe('update', () => {
        it('actualiza los campos y conserva id y restaurante', async () => {
            const original = await crear()
            const actualizado = await service.update('r1', original.id, { code: 'otro', type: 'fixed', value: 5, active: false })
            expect(actualizado).toMatchObject({ id: original.id, restaurantId: 'r1', code: 'OTRO', type: 'fixed', value: 5, active: false })
        })

        it('permite guardar el mismo código sin considerarlo duplicado', async () => {
            const original = await crear()
            await expect(service.update('r1', original.id, { code: 'VERANO10', type: 'percent', value: 20 })).resolves.toBeDefined()
        })

        it('rechaza renombrar a un código que ya existe', async () => {
            await crear('r1', { code: 'UNO' })
            const dos = await crear('r1', { code: 'DOS' })
            await expect(service.update('r1', dos.id, { code: 'UNO', type: 'percent', value: 5 })).rejects.toThrow(DuplicatedDiscountCodeError)
        })

        it('no actualiza un código de otro restaurante', async () => {
            const { id } = await crear('r1')
            await expect(service.update('r2', id, { code: 'X123', type: 'percent', value: 5 })).rejects.toThrow(DiscountCodeNotFoundError)
        })
    })

    describe('delete', () => {
        it('borra un código', async () => {
            const { id } = await crear()
            await service.delete('r1', id)
            await expect(service.findById('r1', id)).rejects.toThrow(DiscountCodeNotFoundError)
        })

        it('no borra un código de otro restaurante', async () => {
            const { id } = await crear('r1')
            await expect(service.delete('r2', id)).rejects.toThrow(DiscountCodeNotFoundError)
            await expect(service.findById('r1', id)).resolves.toBeDefined()
        })
    })
})

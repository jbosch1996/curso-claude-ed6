import { describe, it, expect, beforeEach } from 'vitest'
import { TableService } from './table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import {
    TableNotFoundError, InvalidTableError, InvalidTableStatusError, DuplicatedTableNumberError,
    TableNotAvailableError, TableOccupiedError
} from '@errors/DomainErrors.js'

describe('TableService', () => {
    let service: TableService

    const crear = (restaurantId = 'r1', cambios: Record<string, unknown> = {}) =>
        service.create(restaurantId, { number: 1, capacity: 4, description: 'Terraza', ...cambios })

    beforeEach(() => {
        service = new TableService(new MockTableRepository())
    })

    describe('create', () => {
        it('crea una mesa libre por defecto', async () => {
            const mesa = await crear()
            expect(mesa).toMatchObject({ restaurantId: 'r1', number: 1, capacity: 4, description: 'Terraza', status: 'libre' })
            expect(mesa.id).toBeTruthy()
        })

        it('acepta un estado inicial', async () => {
            expect((await crear('r1', { status: 'reservada' })).status).toBe('reservada')
        })

        it('rechaza un número repetido en el mismo restaurante', async () => {
            await crear()
            await expect(crear()).rejects.toThrow(DuplicatedTableNumberError)
        })

        it('permite el mismo número en otro restaurante', async () => {
            await crear('r1')
            await expect(crear('r2')).resolves.toBeDefined()
        })

        it('rechaza datos inválidos', async () => {
            await expect(crear('r1', { capacity: 0 })).rejects.toThrow(InvalidTableError)
            await expect(crear('r1', { number: 1.5 })).rejects.toThrow(InvalidTableError)
            await expect(crear('r1', { status: 'rota' })).rejects.toThrow(InvalidTableStatusError)
        })
    })

    describe('update', () => {
        it('actualiza los campos y conserva id, restaurante y estado si no se indica', async () => {
            const original = await crear('r1', { status: 'reservada' })
            const actualizada = await service.update('r1', original.id, { number: 7, capacity: 6, description: null })
            expect(actualizada).toMatchObject({ id: original.id, restaurantId: 'r1', number: 7, capacity: 6, description: null, status: 'reservada' })
        })

        it('permite cambiar el estado', async () => {
            const { id } = await crear()
            expect((await service.update('r1', id, { number: 1, capacity: 4, status: 'ocupada' })).status).toBe('ocupada')
        })

        it('permite guardar el mismo número sin considerarlo duplicado', async () => {
            const { id } = await crear()
            await expect(service.update('r1', id, { number: 1, capacity: 8 })).resolves.toBeDefined()
        })

        it('rechaza cambiar a un número que ya existe', async () => {
            await crear('r1', { number: 1 })
            const dos = await crear('r1', { number: 2 })
            await expect(service.update('r1', dos.id, { number: 1, capacity: 4 })).rejects.toThrow(DuplicatedTableNumberError)
        })

        it('no actualiza una mesa de otro restaurante', async () => {
            const { id } = await crear('r1')
            await expect(service.update('r2', id, { number: 1, capacity: 4 })).rejects.toThrow(TableNotFoundError)
        })

        it('rechaza datos inválidos', async () => {
            const { id } = await crear()
            await expect(service.update('r1', id, { number: 1, capacity: 99 })).rejects.toThrow(InvalidTableError)
        })
    })

    describe('findById, list y delete', () => {
        it('devuelve la mesa de su restaurante y null si es de otro', async () => {
            const { id } = await crear('r1')
            expect((await service.findById('r1', id))?.number).toBe(1)
            expect(await service.findById('r2', id)).toBeNull()
            expect(await service.findById('r1', 'nope')).toBeNull()
        })

        it('lista solo las mesas del restaurante, ordenadas por número', async () => {
            await crear('r1', { number: 2 })
            await crear('r1', { number: 1 })
            await crear('r2', { number: 5 })
            expect((await service.list('r1')).map(m => m.number)).toEqual([1, 2])
        })

        it('borra una mesa libre', async () => {
            const { id } = await crear()
            await service.delete('r1', id)
            expect(await service.findById('r1', id)).toBeNull()
        })

        it('borra una mesa reservada', async () => {
            const { id } = await crear('r1', { status: 'reservada' })
            await expect(service.delete('r1', id)).resolves.toBeUndefined()
        })

        it('no borra una mesa ocupada', async () => {
            const { id } = await crear('r1', { status: 'ocupada' })
            await expect(service.delete('r1', id)).rejects.toThrow(TableOccupiedError)
            expect(await service.findById('r1', id)).not.toBeNull()
        })

        it('no borra una mesa de otro restaurante ni una inexistente', async () => {
            const { id } = await crear('r1')
            await expect(service.delete('r2', id)).rejects.toThrow(TableNotFoundError)
            await expect(service.delete('r1', 'nope')).rejects.toThrow(TableNotFoundError)
            expect(await service.findById('r1', id)).not.toBeNull()
        })
    })

    describe('updateStatus', () => {
        it.each(['libre', 'ocupada', 'reservada'])('permite pasar a %s desde cualquier estado', async (estado) => {
            const { id } = await crear('r1', { status: 'ocupada' })
            expect((await service.updateStatus('r1', id, estado)).status).toBe(estado)
        })

        it('normaliza el estado', async () => {
            const { id } = await crear()
            expect((await service.updateStatus('r1', id, ' OCUPADA ')).status).toBe('ocupada')
        })

        it('rechaza un estado inválido y no cambia la mesa', async () => {
            const { id } = await crear()
            await expect(service.updateStatus('r1', id, 'rota')).rejects.toThrow(InvalidTableStatusError)
            expect((await service.findById('r1', id))?.status).toBe('libre')
        })

        it('no cambia el estado de una mesa de otro restaurante', async () => {
            const { id } = await crear('r1')
            await expect(service.updateStatus('r2', id, 'ocupada')).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('listAvailable y occupy', () => {
        it('lista solo las mesas libres con capacidad suficiente', async () => {
            await crear('r1', { number: 1, capacity: 2 })
            await crear('r1', { number: 2, capacity: 4 })
            await crear('r1', { number: 3, capacity: 6, status: 'ocupada' })
            await crear('r2', { number: 1, capacity: 4 })
            expect((await service.listAvailable('r1', 3)).map(m => m.number)).toEqual([2])
        })

        it('rechaza un número de personas inválido', async () => {
            await expect(service.listAvailable('r1', 0)).rejects.toThrow(InvalidTableError)
            await expect(service.listAvailable('r1', NaN)).rejects.toThrow(InvalidTableError)
            await expect(service.occupy('r1', 'x', 51)).rejects.toThrow(InvalidTableError)
        })

        it('ocupa una mesa libre y la devuelve ocupada', async () => {
            const { id } = await crear('r1', { capacity: 4 })
            expect((await service.occupy('r1', id, 3)).status).toBe('ocupada')
            expect(await service.listAvailable('r1', 1)).toEqual([])
        })

        it('no se puede ocupar dos veces la misma mesa', async () => {
            const { id } = await crear()
            await service.occupy('r1', id, 2)
            await expect(service.occupy('r1', id, 2)).rejects.toThrow(TableNotAvailableError)
        })

        it.each([
            ['es pequeña', 'r1', { capacity: 2 }, 3],
            ['está reservada', 'r1', { status: 'reservada' }, 2],
            ['es de otro restaurante', 'r2', {}, 2]
        ])('devuelve el mismo error si la mesa %s', async (_n, restaurantId, cambios, guests) => {
            const { id } = await crear('r1', cambios)
            await expect(service.occupy(restaurantId, id, guests)).rejects.toThrow('Table is not available')
        })

        it('una mesa inexistente da el mismo error', async () => {
            await expect(service.occupy('r1', 'nope', 2)).rejects.toThrow(TableNotAvailableError)
        })
    })
})

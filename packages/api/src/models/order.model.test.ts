import { describe, it, expect } from 'vitest'
import { assertTransitionAllowed } from './order.model.js'
import type { OrderItem, OrderStatusType } from './order.model.js'
import { ForbiddenTransitionError } from '@errors/DomainErrors.js'

const item = (status: OrderStatusType, dishCategory = 'principal'): OrderItem => ({
    id: 'i1',
    dishId: 'd1',
    quantity: 1,
    notes: null,
    status,
    dishCategory
})

describe('assertTransitionAllowed', () => {
    describe('cocinero', () => {
        it('puede pasar pendiente a preparando', () => {
            expect(() => assertTransitionAllowed('cocinero', item('pendiente'), 'preparando')).not.toThrow()
        })

        it('puede pasar preparando a listo', () => {
            expect(() => assertTransitionAllowed('cocinero', item('preparando'), 'listo')).not.toThrow()
        })

        it('puede actuar también sobre bebidas', () => {
            expect(() => assertTransitionAllowed('cocinero', item('pendiente', 'bebida'), 'preparando')).not.toThrow()
        })

        it('no puede entregar', () => {
            expect(() => assertTransitionAllowed('cocinero', item('listo'), 'entregado')).toThrow(ForbiddenTransitionError)
        })

        it('no puede saltarse el paso de preparando', () => {
            expect(() => assertTransitionAllowed('cocinero', item('pendiente'), 'listo')).toThrow(ForbiddenTransitionError)
        })
    })

    describe('camarero', () => {
        it('puede marcar como listo una bebida pendiente', () => {
            expect(() => assertTransitionAllowed('camarero', item('pendiente', 'bebida'), 'listo')).not.toThrow()
        })

        it('no puede marcar como listo un plato que no es bebida', () => {
            expect(() => assertTransitionAllowed('camarero', item('pendiente', 'principal'), 'listo')).toThrow(ForbiddenTransitionError)
        })

        it('puede entregar un ítem listo', () => {
            expect(() => assertTransitionAllowed('camarero', item('listo'), 'entregado')).not.toThrow()
        })

        it('no puede pasar a preparando', () => {
            expect(() => assertTransitionAllowed('camarero', item('pendiente', 'bebida'), 'preparando')).toThrow(ForbiddenTransitionError)
        })

        it('no puede entregar un ítem que aún no está listo', () => {
            expect(() => assertTransitionAllowed('camarero', item('preparando'), 'entregado')).toThrow(ForbiddenTransitionError)
        })
    })

    describe('manager y admin', () => {
        it.each(['manager', 'admin'])('%s puede avanzar saltándose pasos', (rol) => {
            expect(() => assertTransitionAllowed(rol, item('pendiente'), 'entregado')).not.toThrow()
            expect(() => assertTransitionAllowed(rol, item('pendiente'), 'listo')).not.toThrow()
            expect(() => assertTransitionAllowed(rol, item('preparando'), 'entregado')).not.toThrow()
        })

        it.each(['manager', 'admin'])('%s no puede retroceder', (rol) => {
            expect(() => assertTransitionAllowed(rol, item('listo'), 'pendiente')).toThrow(ForbiddenTransitionError)
            expect(() => assertTransitionAllowed(rol, item('entregado'), 'listo')).toThrow(ForbiddenTransitionError)
        })

        it.each(['manager', 'admin'])('%s no puede repetir el mismo estado', (rol) => {
            expect(() => assertTransitionAllowed(rol, item('listo'), 'listo')).toThrow(ForbiddenTransitionError)
        })
    })

    it('un cliente no puede cambiar ningún estado', () => {
        expect(() => assertTransitionAllowed('cliente', item('pendiente'), 'preparando')).toThrow(ForbiddenTransitionError)
        expect(() => assertTransitionAllowed('cliente', item('listo'), 'entregado')).toThrow(ForbiddenTransitionError)
    })
})

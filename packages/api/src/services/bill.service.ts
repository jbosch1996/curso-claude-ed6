import { randomUUID } from 'crypto'
import type { Order } from '@models/order.model.js'
import type { Bill } from '@models/bill.model.js'
import { roundMoney, computeCodeDiscount, computeTotal, earnedPoints } from '@models/bill.model.js'
import type { DiscountCode } from '@models/discount-code.model.js'
import { normalizeCode, isCodeRedeemable } from '@models/discount-code.model.js'
import type { PointsRule } from '@models/points-rule.model.js'
import type { OrderRepository } from '@repositories/order.repository.js'
import type { BillRepository } from '@repositories/bill.repository.js'
import type { DiscountCodeRepository } from '@repositories/discount-code.repository.js'
import type { PointsRuleRepository } from '@repositories/points-rule.repository.js'
import type { ClientPointsRepository } from '@repositories/client-points.repository.js'
import type { PointsEarningRepository } from '@repositories/points-earning.repository.js'
import { DEFAULT_POINTS_EARNING } from '@models/points-earning.model.js'
import type { OrderActor } from '@services/order.service.js'
import {
    OrderNotFoundError, BillNotFoundError, BillAlreadyRequestedError, InvalidBillError,
    InvalidDiscountCodeError, PointsRuleNotFoundError, InsufficientPointsError
} from '@errors/DomainErrors.js'

const STAFF_ROLES = ['manager', 'camarero', 'cocinero']

export interface RequestBillInput {
    discountCode?: string | null
    pointsRuleId?: string | null
}

export class BillService {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly billRepository: BillRepository,
        private readonly discountCodeRepository: DiscountCodeRepository,
        private readonly pointsRuleRepository: PointsRuleRepository,
        private readonly clientPointsRepository: ClientPointsRepository,
        // Opcional: sin repositorio se usa el ritmo por defecto (1 punto por euro).
        private readonly pointsEarningRepository?: PointsEarningRepository
    ) {}

    async create(orderId: string, actor: OrderActor, input: RequestBillInput): Promise<Bill> {
        const order = await this.orderRepository.findById(orderId)
        if (!order || order.clientId === null || order.clientId !== actor.id) {
            throw new OrderNotFoundError()
        }
        if (await this.billRepository.findByOrderId(orderId)) {
            throw new BillAlreadyRequestedError()
        }

        const discountCode = this.optionalString(input?.discountCode, 'discountCode')
        const pointsRuleId = this.optionalString(input?.pointsRuleId, 'pointsRuleId')

        const subtotal = roundMoney(order.items.reduce((sum, item) => sum + (item.dishPrice ?? 0) * item.quantity, 0))

        const code = discountCode ? await this.findRedeemableCode(order.restaurantId, discountCode) : null
        const codeDiscount = code ? computeCodeDiscount(code, subtotal) : 0

        const rule = pointsRuleId ? await this.findRedeemableRule(order, actor.id, pointsRuleId, subtotal - codeDiscount) : null
        const pointsDiscount = rule ? rule.discount : 0

        const total = computeTotal(subtotal, codeDiscount, pointsDiscount)
        const earningRate = await this.pointsEarningRepository?.findByRestaurantId(order.restaurantId) ?? DEFAULT_POINTS_EARNING
        const bill: Bill = {
            id: randomUUID(),
            orderId,
            restaurantId: order.restaurantId,
            clientId: actor.id,
            subtotal,
            discountCodeId: code?.id ?? null,
            codeDiscount,
            pointsUsed: rule?.points ?? 0,
            pointsDiscount,
            total,
            pointsEarned: earnedPoints(total, earningRate),
            createdAt: new Date().toISOString()
        }

        await this.saveBill(bill)

        // Sin transacciones (conexión SQLite compartida): si el saldo se gastó entre la
        // comprobación y el descuento, se deshace la cuenta recién creada.
        if (rule && !await this.clientPointsRepository.tryDeduct(actor.id, order.restaurantId, rule.points)) {
            await this.billRepository.delete(bill.id)
            throw new InsufficientPointsError()
        }
        if (bill.pointsEarned > 0) {
            await this.clientPointsRepository.add(actor.id, order.restaurantId, bill.pointsEarned)
        }

        return bill
    }

    async getByOrderId(orderId: string, actor: OrderActor): Promise<Bill> {
        const order = await this.orderRepository.findById(orderId)
        if (!order || !this.canView(order, actor)) {
            throw new OrderNotFoundError()
        }
        const bill = await this.billRepository.findByOrderId(orderId)
        if (!bill) throw new BillNotFoundError()
        return bill
    }

    private async saveBill(bill: Bill): Promise<void> {
        try {
            await this.billRepository.create(bill)
        } catch (error) {
            if (await this.billRepository.findByOrderId(bill.orderId)) {
                throw new BillAlreadyRequestedError()
            }
            throw error
        }
    }

    private async findRedeemableCode(restaurantId: string, rawCode: string): Promise<DiscountCode> {
        let normalized: string
        try {
            normalized = normalizeCode(rawCode)
        } catch {
            throw new InvalidDiscountCodeError()
        }
        const code = await this.discountCodeRepository.findByCode(restaurantId, normalized)
        if (!code || !isCodeRedeemable(code, new Date())) {
            throw new InvalidDiscountCodeError()
        }
        return code
    }

    private async findRedeemableRule(order: Order, clientId: string, ruleId: string, remaining: number): Promise<PointsRule> {
        const rule = await this.pointsRuleRepository.findById(order.restaurantId, ruleId)
        if (!rule) throw new PointsRuleNotFoundError()
        if (rule.discount > remaining) {
            throw new InvalidBillError('Points discount exceeds the remaining amount to pay')
        }
        if (await this.clientPointsRepository.getBalance(clientId, order.restaurantId) < rule.points) {
            throw new InsufficientPointsError()
        }
        return rule
    }

    private optionalString(value: unknown, field: string): string | null {
        if (value === undefined || value === null) return null
        if (typeof value !== 'string') throw new InvalidBillError(`${field} must be a string`)
        return value.trim() === '' ? null : value
    }

    private canView(order: Order, actor: OrderActor): boolean {
        if (order.clientId !== null && order.clientId === actor.id) return true
        if (actor.role === 'admin') return true
        return STAFF_ROLES.includes(actor.role) && actor.restaurantId === order.restaurantId
    }
}

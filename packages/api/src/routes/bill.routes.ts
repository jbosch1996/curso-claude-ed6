import { Router } from 'express'
import { BillController } from '@controllers/bill.controller.js'
import { BillService } from '@services/bill.service.js'
import { SqliteOrderRepository } from '@repositories/order.repository.js'
import { SqliteBillRepository } from '@repositories/bill.repository.js'
import { SqliteDiscountCodeRepository } from '@repositories/discount-code.repository.js'
import { SqlitePointsRuleRepository } from '@repositories/points-rule.repository.js'
import { SqliteClientPointsRepository } from '@repositories/client-points.repository.js'
import { SqlitePointsEarningRepository } from '@repositories/points-earning.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate } from '@shared/infrastructure/http/middlewares.js'

export const createBillRouter = (service: BillService): Router => {
    const controller = new BillController(service)
    const router = Router()

    router.post('/:orderId/bill', authenticate, controller.create)
    router.get('/:orderId/bill', authenticate, controller.getByOrder)

    return router
}

export default createBillRouter(new BillService(
    new SqliteOrderRepository(dbConfig),
    new SqliteBillRepository(dbConfig),
    new SqliteDiscountCodeRepository(dbConfig),
    new SqlitePointsRuleRepository(dbConfig),
    new SqliteClientPointsRepository(dbConfig),
    new SqlitePointsEarningRepository(dbConfig)
))

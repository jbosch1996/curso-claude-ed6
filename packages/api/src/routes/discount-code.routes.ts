import { Router } from 'express'
import { DiscountCodeController } from '@controllers/discount-code.controller.js'
import { DiscountCodeService } from '@services/discount-code.service.js'
import { SqliteDiscountCodeRepository } from '@repositories/discount-code.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const MANAGEMENT_ROLES = ['admin', 'manager']

export const createDiscountCodeRouter = (service: DiscountCodeService): Router => {
    const controller = new DiscountCodeController(service)
    const router = Router({ mergeParams: true })
    const guard = [authenticate, authorize(MANAGEMENT_ROLES), requireRestaurantAccess()]

    router.post('/', ...guard, controller.create)
    router.get('/', ...guard, controller.getAll)
    router.get('/:id', ...guard, controller.getById)
    router.put('/:id', ...guard, controller.update)
    router.delete('/:id', ...guard, controller.delete)

    return router
}

export default createDiscountCodeRouter(new DiscountCodeService(new SqliteDiscountCodeRepository(dbConfig)))

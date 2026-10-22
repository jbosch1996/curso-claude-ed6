import { Router } from 'express'
import { PointsRuleController } from '@controllers/points-rule.controller.js'
import { PointsRuleService } from '@services/points-rule.service.js'
import { SqlitePointsRuleRepository } from '@repositories/points-rule.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const MANAGEMENT_ROLES = ['admin', 'manager']

export const createPointsRuleRouter = (service: PointsRuleService): Router => {
    const controller = new PointsRuleController(service)
    const router = Router({ mergeParams: true })
    const guard = [authenticate, authorize(MANAGEMENT_ROLES), requireRestaurantAccess()]

    router.post('/', ...guard, controller.create)
    router.get('/', ...guard, controller.getAll)
    router.put('/:id', ...guard, controller.update)
    router.delete('/:id', ...guard, controller.delete)

    return router
}

export default createPointsRuleRouter(new PointsRuleService(new SqlitePointsRuleRepository(dbConfig)))

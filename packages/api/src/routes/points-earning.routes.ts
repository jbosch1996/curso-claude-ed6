import { Router } from 'express'
import { PointsEarningController } from '@controllers/points-earning.controller.js'
import { PointsEarningService } from '@services/points-earning.service.js'
import { SqlitePointsEarningRepository } from '@repositories/points-earning.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const MANAGEMENT_ROLES = ['admin', 'manager']

export const createPointsEarningRouter = (service: PointsEarningService): Router => {
    const controller = new PointsEarningController(service)
    const router = Router({ mergeParams: true })
    const guard = [authenticate, authorize(MANAGEMENT_ROLES), requireRestaurantAccess()]

    router.get('/', ...guard, controller.get)
    router.put('/', ...guard, controller.update)

    return router
}

export default createPointsEarningRouter(new PointsEarningService(new SqlitePointsEarningRepository(dbConfig)))

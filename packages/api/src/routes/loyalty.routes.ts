import { Router } from 'express'
import { LoyaltyController } from '@controllers/loyalty.controller.js'
import { LoyaltyService } from '@services/loyalty.service.js'
import { SqliteClientPointsRepository } from '@repositories/client-points.repository.js'
import { SqlitePointsRuleRepository } from '@repositories/points-rule.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate } from '@shared/infrastructure/http/middlewares.js'

export const createLoyaltyRouter = (service: LoyaltyService): Router => {
    const controller = new LoyaltyController(service)
    const router = Router()

    router.get('/:restaurantId', authenticate, controller.getSummary)

    return router
}

export default createLoyaltyRouter(new LoyaltyService(
    new SqliteClientPointsRepository(dbConfig),
    new SqlitePointsRuleRepository(dbConfig)
))

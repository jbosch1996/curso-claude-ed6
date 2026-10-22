import { Router } from 'express'
import { PackController } from '@controllers/pack.controller.js'
import { PackService } from '@services/pack.service.js'
import { SqlitePackRepository } from '@repositories/pack.repository.js'
import { SqliteDishRepository } from '@repositories/dish.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const MANAGEMENT_ROLES = ['admin', 'manager']

export const createPackRouter = (service: PackService): Router => {
    const controller = new PackController(service)
    const router = Router({ mergeParams: true })
    const guard = [authenticate, authorize(MANAGEMENT_ROLES), requireRestaurantAccess()]

    router.post('/', ...guard, controller.create)
    router.get('/', ...guard, controller.getAll)
    router.get('/:id', ...guard, controller.getById)
    router.put('/:id', ...guard, controller.update)
    router.delete('/:id', ...guard, controller.delete)

    return router
}

export default createPackRouter(new PackService(new SqlitePackRepository(dbConfig), new SqliteDishRepository(dbConfig)))

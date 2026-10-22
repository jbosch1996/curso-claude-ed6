import { Router } from 'express'
import { PackController } from '@controllers/pack.controller.js'
import { PackService } from '@services/pack.service.js'
import { SqlitePackRepository } from '@repositories/pack.repository.js'
import { SqliteDishRepository } from '@repositories/dish.repository.js'
import { dbConfig } from '@config/database.js'

export const createPublicPackRouter = (service: PackService): Router => {
    const controller = new PackController(service)
    const router = Router({ mergeParams: true })

    router.get('/', controller.getPublic)

    return router
}

export default createPublicPackRouter(new PackService(new SqlitePackRepository(dbConfig), new SqliteDishRepository(dbConfig)))

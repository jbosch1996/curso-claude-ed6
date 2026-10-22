import { Router } from 'express'
import { TableController } from '@controllers/table.controller.js'
import { TableService } from '@services/table.service.js'
import { SqliteTableRepository } from '@repositories/table.repository.js'
import { dbConfig } from '@config/database.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const STAFF_ROLES = ['admin', 'manager', 'camarero', 'cocinero']

export const createTableRouter = (service: TableService): Router => {
    const controller = new TableController(service)
    const router = Router({ mergeParams: true })
    const staff = [authenticate, authorize(STAFF_ROLES), requireRestaurantAccess()]
    const adminOnly = [authenticate, authorize(['admin']), requireRestaurantAccess()]

    // Rutas del cliente: no llevan requireRestaurantAccess porque un cliente tiene restaurantId nulo;
    // el restaurantId de la URL acota la consulta. /available va antes de /:id.
    router.get('/available', authenticate, authorize(['cliente']), controller.getAvailable)
    router.post('/:id/occupy', authenticate, authorize(['cliente']), controller.occupy)

    router.get('/', ...staff, controller.getAll)
    router.get('/:id', ...staff, controller.getById)
    router.patch('/:id/status', ...staff, controller.updateStatus)

    router.post('/', ...adminOnly, controller.create)
    router.put('/:id', ...adminOnly, controller.update)
    router.delete('/:id', ...adminOnly, controller.delete)

    return router
}

export default createTableRouter(new TableService(new SqliteTableRepository(dbConfig)))

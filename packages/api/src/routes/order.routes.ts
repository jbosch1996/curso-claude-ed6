import { Router } from 'express'
import { OrderController } from '@controllers/order.controller.js'
import { OrderService } from '@services/order.service.js'
import { SqliteOrderRepository } from '@repositories/order.repository.js'
import { dbConfig } from '@config/database.js'
import { SqliteDishRepository } from '@repositories/dish.repository.js'
import { SqliteTableRepository } from '@repositories/table.repository.js'
import { authenticate, authorize } from '@shared/infrastructure/http/middlewares.js'

const STAFF_ROLES = ['admin', 'manager', 'camarero', 'cocinero']

export const createOrderRouter = (orderService: OrderService): Router => {
    const orderController = new OrderController(orderService)
    const router = Router()

    router.post('/', authenticate, orderController.createOrder.bind(orderController))
    router.get('/active', authenticate, authorize(STAFF_ROLES), orderController.getActiveOrders.bind(orderController))
    router.get('/mine', authenticate, orderController.getMyOrders.bind(orderController))
    router.get('/:id', authenticate, orderController.getById.bind(orderController))
    router.patch('/:orderId/items/:itemId/status', authenticate, authorize(STAFF_ROLES), orderController.updateItemStatus.bind(orderController))

    return router
}

const orderRepository = new SqliteOrderRepository(dbConfig)
const dishRepository = new SqliteDishRepository(dbConfig)

const tableRepository = new SqliteTableRepository(dbConfig)

export default createOrderRouter(new OrderService(orderRepository, dishRepository, tableRepository))

import { Router } from 'express'
import { DishController } from '@controllers/dish.controller.js'
import { dbConfig } from '@config/database.js'
import { SqliteDishRepository } from '@repositories/dish.repository.js'
import { SqliteIngredientRepository } from '@repositories/ingredient.repository.js'
import { DishService } from '@services/dish.service.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const dishRepository = new SqliteDishRepository(dbConfig)
const ingredientRepository = new SqliteIngredientRepository(dbConfig)
const dishService = new DishService(dishRepository, ingredientRepository)
const dishController = new DishController(dishService)

const router = Router({ mergeParams: true })

router.post('/', authenticate, authorize(['admin', 'manager']), requireRestaurantAccess(), dishController.create)
router.get('/', authenticate, authorize(['admin', 'manager', 'camarero', 'cocinero']), requireRestaurantAccess(), dishController.getAll)
router.get('/:id', authenticate, authorize(['admin', 'manager', 'camarero', 'cocinero']), requireRestaurantAccess(), dishController.getById)
router.put('/:id', authenticate, authorize(['admin', 'manager']), requireRestaurantAccess(), dishController.update)
router.delete('/:id', authenticate, authorize(['admin', 'manager']), requireRestaurantAccess(), dishController.delete)

export default router

import { Router } from 'express'
import { IngredientController } from '@controllers/ingredient.controller.js'
import { dbConfig } from '@config/database.js'
import { SqliteIngredientRepository } from '@repositories/ingredient.repository.js'
import { IngredientService } from '@services/ingredient.service.js'
import { authenticate, authorize, requireRestaurantAccess } from '@shared/infrastructure/http/middlewares.js'

const ingredientRepository = new SqliteIngredientRepository(dbConfig)
const ingredientService = new IngredientService(ingredientRepository)
const ingredientController = new IngredientController(ingredientService)

const router = Router({ mergeParams: true })

router.post('/', authenticate, authorize(['admin']), requireRestaurantAccess(), ingredientController.create)
router.get('/', authenticate, authorize(['admin', 'manager', 'cocinero']), requireRestaurantAccess(), ingredientController.getAll)
router.get('/:id', authenticate, authorize(['admin', 'manager', 'cocinero']), requireRestaurantAccess(), ingredientController.getById)
router.put('/:id', authenticate, authorize(['admin']), requireRestaurantAccess(), ingredientController.update)
router.delete('/:id', authenticate, authorize(['admin']), requireRestaurantAccess(), ingredientController.delete)

export default router

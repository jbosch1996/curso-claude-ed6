import { AppError } from '@errors/AppError.js'

export class FirstNameRequiredError extends AppError {
  constructor() {
    super('First name is required')
  }
}

export class LastNameRequiredError extends AppError {
  constructor() {
    super('Last name is required')
  }
}

export class PasswordHashRequiredError extends AppError {
  constructor() {
    super('Password hash is required')
  }
}

export class InvalidRoleError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid role')
  }
}

export class InvalidEmailError extends AppError {
  constructor() {
    super('Invalid email format')
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid credentials')
  }
}

export class DuplicatedEmailError extends AppError {
  constructor() {
    super('Email is already in use')
  }
}

export class EmployeeNotFoundError extends AppError {
  constructor() {
    super('Employee not found')
  }
}

export class RestaurantNameRequiredError extends AppError {
  constructor() {
    super('Restaurant name is required')
  }
}

export class RestaurantAddressRequiredError extends AppError {
  constructor() {
    super('Restaurant address is required')
  }
}

export class RestaurantEmailRequiredError extends AppError {
  constructor() {
    super('Restaurant email is required')
  }
}

export class RestaurantNotFoundError extends AppError {
  constructor() {
    super('Restaurant not found')
  }
}

export class InvalidPhoneError extends AppError {
  constructor() {
    super('Invalid phone format')
  }
}

export class OwnerFirstNameRequiredError extends AppError {
  constructor() {
    super('Owner first name is required')
  }
}

export class OwnerLastNameRequiredError extends AppError {
  constructor() {
    super('Owner last name is required')
  }
}

export class IngredientNameRequiredError extends AppError {
  constructor() {
    super('Ingredient name is required')
  }
}

export class IngredientNotFoundError extends AppError {
  constructor() {
    super('Ingredient not found')
  }
}

export class InvalidUnitError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid unit')
  }
}

export class NegativeStockError extends AppError {
  constructor() {
    super('Stock cannot be negative')
  }
}

export class RestaurantIdRequiredError extends AppError {
  constructor() {
    super('Restaurant ID is required')
  }
}

export class DishNameRequiredError extends AppError {
  constructor() {
    super('Dish name is required')
  }
}

export class InvalidPriceError extends AppError {
  constructor() {
    super('Price must be a positive number')
  }
}

export class InvalidCategoryError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid category')
  }
}

export class InvalidDishIngredientError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid dish ingredient')
  }
}

export class DishNotFoundError extends AppError {
  constructor() {
    super('Dish not found')
  }
}

export class DatabaseNotInitializedError extends AppError {
  constructor() {
    super('Database is not initialized. Call dbConfig.initialize() first.')
  }
}

export class InvalidOrderStatusError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid order status')
  }
}

export class OrderNotFoundError extends AppError {
  constructor() {
    super('Order not found')
  }
}


export class InvalidOrderError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid order')
  }
}

export class ForbiddenTransitionError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Order status transition not allowed')
  }
}

export class InvalidNumberError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Value must be a finite number')
  }
}

export class InvalidLogoUrlError extends AppError {
  constructor() {
    super('Logo URL must be a valid http or https URL')
  }
}

export class DiscountCodeNotFoundError extends AppError {
  constructor() {
    super('Discount code not found')
  }
}

export class InvalidDiscountCodeError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid or expired discount code')
  }
}

export class DuplicatedDiscountCodeError extends AppError {
  constructor() {
    super('Discount code already exists')
  }
}

export class PointsRuleNotFoundError extends AppError {
  constructor() {
    super('Points rule not found')
  }
}

export class InvalidPointsRuleError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid points rule')
  }
}

export class DuplicatedPointsRuleError extends AppError {
  constructor() {
    super('A points rule with those points already exists')
  }
}

export class InsufficientPointsError extends AppError {
  constructor() {
    super('Insufficient points')
  }
}

export class BillNotFoundError extends AppError {
  constructor() {
    super('Bill not found')
  }
}

export class BillAlreadyRequestedError extends AppError {
  constructor() {
    super('The bill for this order was already requested')
  }
}

export class InvalidBillError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid bill')
  }
}

export class TableNotFoundError extends AppError {
  constructor() {
    super('Table not found')
  }
}

export class InvalidTableError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid table')
  }
}

export class InvalidTableStatusError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid table status')
  }
}

export class DuplicatedTableNumberError extends AppError {
  constructor() {
    super('A table with that number already exists')
  }
}

export class TableNotAvailableError extends AppError {
  constructor() {
    super('Table is not available')
  }
}

export class TableOccupiedError extends AppError {
  constructor() {
    super('Cannot delete an occupied table')
  }
}

export class InvalidPointsEarningError extends AppError {
  constructor(message?: string) {
    super(message ?? 'Invalid points earning rate')
  }
}

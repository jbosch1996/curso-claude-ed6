import { InvalidTableError, InvalidTableStatusError } from '@errors/DomainErrors.js'

const VALID_TABLE_STATUSES = ['libre', 'ocupada', 'reservada'] as const

export const MAX_TABLE_CAPACITY = 50
const MAX_DESCRIPTION_LENGTH = 200

export type TableStatusType = typeof VALID_TABLE_STATUSES[number]

export interface Table {
    id: string
    restaurantId: string
    number: number
    description: string | null
    capacity: number
    status: TableStatusType
    createdAt: string
    updatedAt: string
}

export function normalizeTableStatus(value: unknown): TableStatusType {
    const normalized = typeof value === 'string' ? value.toLowerCase().trim() : ''
    if (!VALID_TABLE_STATUSES.includes(normalized as TableStatusType)) {
        throw new InvalidTableStatusError(`Invalid status: ${String(value)}. Must be one of: ${VALID_TABLE_STATUSES.join(', ')}`)
    }
    return normalized as TableStatusType
}

export function validateTableFields(props: { number: unknown; capacity: unknown; description?: unknown }): { number: number; description: string | null; capacity: number } {
    if (!Number.isInteger(props.number) || (props.number as number) < 1) {
        throw new InvalidTableError('Table number must be an integer greater than or equal to 1')
    }
    if (!Number.isInteger(props.capacity) || (props.capacity as number) < 1 || (props.capacity as number) > MAX_TABLE_CAPACITY) {
        throw new InvalidTableError(`Capacity must be an integer between 1 and ${MAX_TABLE_CAPACITY}`)
    }

    let description: string | null = null
    if (props.description !== undefined && props.description !== null) {
        if (typeof props.description !== 'string' || props.description.length > MAX_DESCRIPTION_LENGTH) {
            throw new InvalidTableError(`Description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters`)
        }
        description = props.description.trim() === '' ? null : props.description.trim()
    }

    return { number: props.number as number, description, capacity: props.capacity as number }
}

export function assertValidGuests(guests: unknown): void {
    if (!Number.isInteger(guests) || (guests as number) < 1 || (guests as number) > MAX_TABLE_CAPACITY) {
        throw new InvalidTableError(`guests must be an integer between 1 and ${MAX_TABLE_CAPACITY}`)
    }
}

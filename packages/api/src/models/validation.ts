import { InvalidNumberError, InvalidLogoUrlError } from '@errors/DomainErrors.js'

export function assertPositiveNumber(value: unknown, error: Error = new InvalidNumberError('Value must be a positive number')): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw error
    }
}

export function assertNonNegativeNumber(value: unknown, error: Error = new InvalidNumberError('Value must be a non-negative number')): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw error
    }
}

export function assertHttpUrl(value: unknown): void {
    if (value === null || value === undefined) {
        return
    }
    if (typeof value !== 'string') {
        throw new InvalidLogoUrlError()
    }
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new InvalidLogoUrlError()
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new InvalidLogoUrlError()
    }
}

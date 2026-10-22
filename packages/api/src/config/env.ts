import { randomBytes } from 'crypto'

const LONGITUD_MINIMA_PRODUCCION = 32
const SECRETO_TEST = 'secreto-solo-para-tests-no-usar-en-produccion'

const resolverJwtSecret = (): string => {
    const entorno = process.env.NODE_ENV
    const secreto = process.env.JWT_SECRET

    if (entorno === 'production') {
        if (!secreto) {
            throw new Error('JWT_SECRET es obligatorio en producción')
        }
        if (secreto.length < LONGITUD_MINIMA_PRODUCCION) {
            throw new Error(`JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_PRODUCCION} caracteres en producción`)
        }
        return secreto
    }

    if (secreto) return secreto
    if (entorno === 'test') return SECRETO_TEST

    console.warn('JWT_SECRET no está definido: se usa un secreto aleatorio para este proceso. Las sesiones se perderán al reiniciar.')
    return randomBytes(48).toString('hex')
}

export const JWT_SECRET: string = resolverJwtSecret()

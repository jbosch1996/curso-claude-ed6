import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '@config/env.js'

export interface AuthUser {
    id: string
    role: string
    restaurantId: string | null
}

export interface AuthRequest extends Request {
    user?: AuthUser
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No token provided' })
        return
    }

    const tokenParts = authHeader.split(' ')
    const token = tokenParts[1]
    if (!token) {
        res.status(401).json({ error: 'Unauthorized: Malformed token' })
        return
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
        req.user = decoded as AuthUser
        next()
    } catch {
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
    }
}

export const authorize = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
            return
        }
        next()
    }
}

export const requireRestaurantAccess = (param: string = 'restaurantId') => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        const user = req.user
        if (user?.role === 'admin') {
            next()
            return
        }
        if (!user || !user.restaurantId || user.restaurantId !== req.params[param]) {
            res.status(403).json({ error: 'Forbidden: No access to this restaurant' })
            return
        }
        next()
    }
}

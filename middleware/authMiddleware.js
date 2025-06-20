const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Cache simple para usuarios (opcional, mejora performance)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Limpiar cache periódicamente
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            userCache.delete(key);
        }
    }
}, CACHE_TTL);

/**
 * Middleware de autenticación JWT mejorado
 * Verifica token, usuario válido y estado activo
 */
const auth = async (req, res, next) => {
    try {
        // 1. Extraer token del header
        const authHeader = req.headers.authorization;
        let token = null;
        
        // Soportar múltiples formatos: "Bearer token" o "token"
        if (authHeader) {
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.slice(7); // Remover "Bearer "
            } else {
                token = authHeader; // Token directo
            }
        }
        
        // También revisar en cookies (opcional para web apps)
        if (!token && req.cookies && req.cookies.authToken) {
            token = req.cookies.authToken;
        }
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                msg: 'Acceso denegado - Token de autenticación requerido',
                code: 'NO_TOKEN'
            });
        }
        
        // 2. Verificar token JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            // Manejar diferentes tipos de errores JWT
            let errorMsg = 'Token inválido';
            let errorCode = 'INVALID_TOKEN';
            
            if (jwtError.name === 'TokenExpiredError') {
                errorMsg = 'Token expirado - Inicia sesión nuevamente';
                errorCode = 'EXPIRED_TOKEN';
            } else if (jwtError.name === 'JsonWebTokenError') {
                errorMsg = 'Token malformado';
                errorCode = 'MALFORMED_TOKEN';
            } else if (jwtError.name === 'NotBeforeError') {
                errorMsg = 'Token no válido aún';
                errorCode = 'TOKEN_NOT_ACTIVE';
            }
            
            return res.status(401).json({ 
                success: false,
                msg: errorMsg,
                code: errorCode
            });
        }
        
        // 3. Verificar estructura del token
        if (!decoded.user || !decoded.user.id) {
            return res.status(401).json({ 
                success: false,
                msg: 'Token inválido - Estructura incorrecta',
                code: 'INVALID_TOKEN_STRUCTURE'
            });
        }
        
        const userId = decoded.user.id;
        
        // 4. Buscar usuario (con cache opcional)
        let user = null;
        const cacheKey = `user_${userId}`;
        const cachedUser = userCache.get(cacheKey);
        
        if (cachedUser && (Date.now() - cachedUser.timestamp < CACHE_TTL)) {
            user = cachedUser.user;
        } else {
            // Buscar en base de datos
            user = await User.findById(userId).select('-password -loginAttempts -lockUntil');
            
            if (user) {
                // Guardar en cache
                userCache.set(cacheKey, {
                    user: user.toObject(),
                    timestamp: Date.now()
                });
            }
        }
        
        // 5. Verificar que el usuario existe
        if (!user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Usuario no encontrado - Token inválido',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // 6. Verificar estado del usuario
        if (user.status === 'inactive') {
            return res.status(403).json({ 
                success: false,
                msg: 'Cuenta inactiva - Contacta al administrador',
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        if (user.status === 'suspended') {
            return res.status(403).json({ 
                success: false,
                msg: 'Cuenta suspendida - Contacta al administrador',
                code: 'ACCOUNT_SUSPENDED'
            });
        }
        
        // 7. Verificar si la cuenta está bloqueada
        if (typeof user.isLocked === 'function' && user.isLocked()) {
            return res.status(423).json({ 
                success: false,
                msg: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
                code: 'ACCOUNT_LOCKED',
                lockUntil: user.lockUntil
            });
        }
        
        // 8. Agregar información del usuario al request
        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            permissions: user.permissions || [],
            // Información adicional según el tipo de usuario
            ...(user.role === 'client' && {
                customerCode: user.clientInfo?.customerCode,
                customerType: user.clientInfo?.customerType
            }),
            ...(user.role !== 'client' && {
                employeeId: user.employeeInfo?.employeeId,
                department: user.employeeInfo?.department
            })
        };
        
        // 9. Logging de seguridad (opcional, solo en desarrollo o si es necesario)
        if (process.env.NODE_ENV === 'development' || process.env.ENABLE_AUTH_LOGGING === 'true') {
            console.log(`[AUTH] Usuario autenticado: ${user.email} (${user.role}) - ${req.method} ${req.originalUrl}`);
        }
        
        // 10. Continuar al siguiente middleware
        next();
        
    } catch (error) {
        console.error('Error en middleware de autenticación:', error);
        
        // No exponer detalles del error en producción
        const errorMsg = process.env.NODE_ENV === 'development' 
            ? `Error interno: ${error.message}`
            : 'Error interno del servidor';
            
        return res.status(500).json({ 
            success: false,
            msg: errorMsg,
            code: 'INTERNAL_ERROR'
        });
    }
};

/**
 * Middleware opcional para verificar usuario sin requerir autenticación
 * Útil para endpoints que funcionan tanto autenticados como no
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            // No hay token, continuar sin usuario
            req.user = null;
            return next();
        }
        
        // Si hay token, intentar autenticar
        await auth(req, res, next);
        
    } catch (error) {
        // Si falla la autenticación, continuar sin usuario
        req.user = null;
        next();
    }
};

/**
 * Middleware para verificar roles específicos
 * Usar después del middleware auth
 */
const requireRole = (allowedRoles = []) => {
    return (req, res, next) => {
        // Verificar que el usuario esté autenticado
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Autenticación requerida',
                code: 'AUTH_REQUIRED'
            });
        }
        
        // Verificar rol
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false,
                msg: `Acceso denegado - Se requiere rol: ${allowedRoles.join(' o ')}`,
                code: 'INSUFFICIENT_ROLE',
                userRole: req.user.role,
                requiredRoles: allowedRoles
            });
        }
        
        next();
    };
};

/**
 * Middleware para verificar permisos específicos
 * Útil para control granular de acceso
 */
const requirePermission = (requiredPermissions = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Autenticación requerida',
                code: 'AUTH_REQUIRED'
            });
        }
        
        // Admin tiene todos los permisos
        if (req.user.role === 'admin') {
            return next();
        }
        
        // Verificar permisos específicos
        const userPermissions = req.user.permissions || [];
        const hasPermission = requiredPermissions.some(permission => 
            userPermissions.includes(permission)
        );
        
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false,
                msg: 'Permisos insuficientes',
                code: 'INSUFFICIENT_PERMISSIONS',
                requiredPermissions
            });
        }
        
        next();
    };
};

/**
 * Middleware para verificar que el usuario es propietario del recurso
 * Útil para endpoints donde el usuario solo puede acceder a sus propios datos
 */
const requireOwnership = (resourceField = 'client') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Autenticación requerida',
                code: 'AUTH_REQUIRED'
            });
        }
        
        // Admin y supervisores pueden acceder a todo
        if (['admin', 'supervisor'].includes(req.user.role)) {
            return next();
        }
        
        // Para clientes, verificar que el recurso les pertenece
        if (req.user.role === 'client') {
            const resourceId = req.params.id || req.body[resourceField] || req.query[resourceField];
            
            if (resourceId && resourceId !== req.user.id) {
                return res.status(403).json({ 
                    success: false,
                    msg: 'Acceso denegado - Solo puedes acceder a tus propios recursos',
                    code: 'NOT_OWNER'
                });
            }
        }
        
        next();
    };
};

// Limpiar cache al cerrar la aplicación
process.on('SIGINT', () => {
    userCache.clear();
});

process.on('SIGTERM', () => {
    userCache.clear();
});

module.exports = {
    auth,
    optionalAuth,
    requireRole,
    requirePermission,
    requireOwnership
};
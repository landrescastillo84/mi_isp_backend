const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware de autenticación principal
 */
const auth = async (req, res, next) => {
    try {
        // Extraer token del header
        const authHeader = req.headers.authorization;
        let token = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        }
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                msg: 'Token de autenticación requerido' 
            });
        }
        
        // Verificar token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_temporal');
        
        // CORREGIDO: Verificar userId directamente (no decoded.user.id)
        if (!decoded.userId) {
            return res.status(401).json({ 
                success: false,
                msg: 'Token inválido - falta userId' 
            });
        }
        
        // CORREGIDO: Buscar usuario con decoded.userId
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Usuario no encontrado' 
            });
        }
        
        // Verificar estado del usuario
        if (user.status === 'inactive' || user.status === 'suspended') {
            return res.status(403).json({ 
                success: false,
                msg: 'Cuenta inactiva o suspendida' 
            });
        }
        
        // Agregar usuario al request
        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status
        };
        
        next();
        
    } catch (error) {
        console.error('Error en auth middleware:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                msg: 'Token expirado' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                msg: 'Token inválido' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            msg: 'Error interno del servidor' 
        });
    }
};

/**
 * Middleware para verificar roles específicos
 */
const requireRole = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Autenticación requerida' 
            });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false,
                msg: `Acceso denegado - Se requiere rol: ${allowedRoles.join(' o ')}`,
                userRole: req.user.role,
                requiredRoles: allowedRoles
            });
        }
        
        next();
    };
};

/**
 * Middleware para verificar que el usuario es propietario del recurso
 */
const requireOwnership = (resourceField = 'client') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                msg: 'Autenticación requerida' 
            });
        }
        
        // Admin y supervisores pueden acceder a todo
        if (['admin', 'supervisor'].includes(req.user.role)) {
            return next();
        }
        
        // Para clientes, verificar que el recurso les pertenece
        if (req.user.role === 'client') {
            const resourceId = req.params.id || req.params.clientId || req.body[resourceField] || req.query[resourceField];
            
            if (resourceId && resourceId !== req.user.id) {
                return res.status(403).json({ 
                    success: false,
                    msg: 'Acceso denegado - Solo puedes acceder a tus propios recursos' 
                });
            }
        }
        
        next();
    };
};

module.exports = {
    auth,
    requireRole,
    requireOwnership
};
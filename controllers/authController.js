const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// Generar JWT Token
const generateToken = (userId, userRole) => {
    return new Promise((resolve, reject) => {
        const payload = {
            user: {
                id: userId,
                role: userRole
            }
        };
        
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) reject(err);
                resolve(token);
            }
        );
    });
};

// Registrar usuario
exports.register = async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const { 
            name, 
            email, 
            password, 
            role = 'client',
            phone,
            alternativePhone,
            address,
            clientInfo,
            employeeInfo 
        } = req.body;
        
        // Verificar si el usuario ya existe
        let existingUser = await User.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { 'clientInfo.identificationNumber': clientInfo?.identificationNumber }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                msg: 'Usuario ya existe con ese email o número de identificación' 
            });
        }
        
        // Validar permisos para crear roles específicos
        if (req.user && !['admin', 'supervisor'].includes(req.user.role)) {
            if (['admin', 'technician', 'operator', 'supervisor', 'billing'].includes(role)) {
                return res.status(403).json({ 
                    msg: 'No tienes permisos para crear usuarios con ese rol' 
                });
            }
        }
        
        // Preparar datos del nuevo usuario
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role,
            phone: phone?.trim(),
            alternativePhone: alternativePhone?.trim()
        };
        
        // Agregar información específica según el rol
        if (role === 'client') {
            userData.address = {
                street: address?.street?.trim(),
                city: address?.city?.trim(),
                state: address?.state?.trim(),
                zipCode: address?.zipCode?.trim(),
                coordinates: address?.coordinates
            };
            
            userData.clientInfo = {
                identificationNumber: clientInfo?.identificationNumber?.trim(),
                identificationType: clientInfo?.identificationType || 'DNI',
                customerType: clientInfo?.customerType || 'residential',
                companyName: clientInfo?.companyName?.trim(),
                contactPerson: clientInfo?.contactPerson?.trim()
            };
            
            userData.status = 'pending'; // Nuevo cliente pendiente de activación
        } else {
            // Información de empleado
            userData.employeeInfo = {
                employeeId: employeeInfo?.employeeId?.trim(),
                department: employeeInfo?.department,
                hireDate: employeeInfo?.hireDate || new Date(),
                salary: employeeInfo?.salary,
                permissions: employeeInfo?.permissions || []
            };
            
            userData.status = 'active'; // Empleados activos por defecto
        }
        
        // Crear nuevo usuario
        const user = new User(userData);
        await user.save();
        
        // Generar token
        const token = await generateToken(user.id, user.role);
        
        // Respuesta sin información sensible
        const userResponse = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            customerCode: user.clientInfo?.customerCode,
            employeeId: user.employeeInfo?.employeeId
        };
        
        res.status(201).json({
            success: true,
            msg: 'Usuario registrado exitosamente',
            token,
            user: userResponse
        });
        
    } catch (error) {
        console.error('Error en registro:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({ 
                msg: 'Ya existe un usuario con esos datos' 
            });
        }
        
        res.status(500).json({ 
            msg: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Iniciar sesión
exports.login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const { email, password } = req.body;
        
        // Buscar usuario por email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ msg: 'Credenciales inválidas' });
        }
        
        // Verificar si la cuenta está bloqueada
        if (user.isLocked()) {
            return res.status(423).json({ 
                msg: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
                lockUntil: user.lockUntil
            });
        }
        
        // Verificar contraseña
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            // Incrementar intentos fallidos
            await user.incLoginAttempts();
            return res.status(400).json({ msg: 'Credenciales inválidas' });
        }
        
        // Verificar estado del usuario
        if (user.status === 'inactive') {
            return res.status(403).json({ 
                msg: 'Cuenta inactiva. Contacta al administrador' 
            });
        }
        
        if (user.status === 'suspended') {
            return res.status(403).json({ 
                msg: 'Cuenta suspendida. Contacta al administrador' 
            });
        }
        
        // Actualizar información de login exitoso
        user.lastLogin = new Date();
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
        
        // Generar token
        const token = await generateToken(user.id, user.role);
        
        // Respuesta con información del usuario
        const userResponse = {
            id: user.id,
            name: user.getDisplayName(),
            email: user.email,
            role: user.role,
            status: user.status,
            customerCode: user.clientInfo?.customerCode,
            employeeId: user.employeeInfo?.employeeId,
            lastLogin: user.lastLogin,
            preferences: user.preferences
        };
        
        res.json({
            success: true,
            msg: 'Login exitoso',
            token,
            user: userResponse
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            msg: 'Error interno del servidor' 
        });
    }
};

// Obtener usuario actual
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -loginAttempts -lockUntil')
            .populate('services.service', 'serviceCode status')
            .populate('cameras', 'name location status');
            
        if (!user) {
            return res.status(404).json({ msg: 'Usuario no encontrado' });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener todos los usuarios (solo admin/supervisor)
exports.getAllUsers = async (req, res) => {
    try {
        // Verificar permisos
        if (!['admin', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { 
            page = 1, 
            limit = 10, 
            role, 
            status, 
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Construir filtros
        const filters = {};
        if (role) filters.role = role;
        if (status) filters.status = status;
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { 'clientInfo.customerCode': { $regex: search, $options: 'i' } },
                { 'clientInfo.identificationNumber': { $regex: search, $options: 'i' } }
            ];
        }
        
        // Opciones de paginación
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
            select: '-password -loginAttempts -lockUntil'
        };
        
        const users = await User.find(filters)
            .select(options.select)
            .sort(options.sort)
            .limit(options.limit * 1)
            .skip((options.page - 1) * options.limit);
            
        const total = await User.countDocuments(filters);
        
        res.json({
            success: true,
            users,
            pagination: {
                currentPage: options.page,
                totalPages: Math.ceil(total / options.limit),
                totalUsers: total,
                hasNext: options.page < Math.ceil(total / options.limit),
                hasPrev: options.page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener usuarios clientes
exports.getClients = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'billing', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { status, customerType, search } = req.query;
        
        const filters = { role: 'client' };
        if (status) filters.status = status;
        if (customerType) filters['clientInfo.customerType'] = customerType;
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'clientInfo.customerCode': { $regex: search, $options: 'i' } }
            ];
        }
        
        const clients = await User.find(filters)
            .select('-password -loginAttempts -lockUntil -employeeInfo')
            .populate('services.service', 'serviceCode status plan')
            .sort({ createdAt: -1 });
            
        res.json({
            success: true,
            clients
        });
        
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Actualizar perfil de usuario
exports.updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const userId = req.user.id;
        const updates = req.body;
        
        // Campos que el usuario puede actualizar
        const allowedUpdates = [
            'name', 'phone', 'alternativePhone', 'address', 
            'preferences', 'emergencyContact'
        ];
        
        // Solo admin puede actualizar ciertos campos
        if (['admin', 'supervisor'].includes(req.user.role)) {
            allowedUpdates.push('status', 'role', 'billingInfo', 'employeeInfo');
        }
        
        // Filtrar actualizaciones permitidas
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });
        
        const user = await User.findByIdAndUpdate(
            userId, 
            { $set: filteredUpdates }, 
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ msg: 'Usuario no encontrado' });
        }
        
        res.json({
            success: true,
            msg: 'Perfil actualizado exitosamente',
            user
        });
        
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Cambiar contraseña
exports.changePassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ msg: 'Usuario no encontrado' });
        }
        
        // Verificar contraseña actual
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Contraseña actual incorrecta' });
        }
        
        // Actualizar contraseña
        user.password = newPassword;
        await user.save();
        
        res.json({
            success: true,
            msg: 'Contraseña cambiada exitosamente'
        });
        
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Activar/Desactivar usuario (solo admin)
exports.toggleUserStatus = async (req, res) => {
    try {
        if (!['admin', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { userId } = req.params;
        const { status, reason } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ msg: 'Usuario no encontrado' });
        }
        
        user.status = status;
        if (reason) {
            user.internalNotes = user.internalNotes || [];
            user.internalNotes.push({
                note: `Estado cambiado a ${status}: ${reason}`,
                addedBy: req.user.id,
                addedAt: new Date()
            });
        }
        
        await user.save();
        
        res.json({
            success: true,
            msg: `Usuario ${status === 'active' ? 'activado' : 'desactivado'} exitosamente`,
            user: {
                id: user.id,
                name: user.name,
                status: user.status
            }
        });
        
    } catch (error) {
        console.error('Error cambiando estado:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Logout (invalidar token - esto requeriría una blacklist de tokens)
exports.logout = async (req, res) => {
    try {
        // En una implementación real, agregar el token a una blacklist
        // Por ahora, solo confirmamos el logout
        
        res.json({
            success: true,
            msg: 'Logout exitoso'
        });
        
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};
       
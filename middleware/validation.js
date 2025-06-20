const { body, param, query, validationResult } = require('express-validator');

// ============================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================

/**
 * Middleware centralizado para manejar errores de validación
 * Usar al final de cada array de validaciones
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            msg: 'Error de validación',
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

// ============================
// VALIDACIONES PERSONALIZADAS
// ============================

// Validador personalizado para DNI ecuatoriano
const isValidEcuadorianDNI = (value) => {
    if (!value || value.length !== 10) return false;
    
    const digits = value.split('').map(Number);
    const provinceCode = parseInt(value.substring(0, 2));
    
    // Verificar código de provincia (01-24)
    if (provinceCode < 1 || provinceCode > 24) return false;
    
    // Algoritmo de validación DNI Ecuador
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    
    for (let i = 0; i < 9; i++) {
        let result = digits[i] * coefficients[i];
        if (result >= 10) result -= 9;
        sum += result;
    }
    
    const checkDigit = sum % 10 === 0 ? 0 : 10 - (sum % 10);
    return checkDigit === digits[9];
};

// Validador personalizado para RUC ecuatoriano
const isValidEcuadorianRUC = (value) => {
    if (!value || value.length !== 13) return false;
    
    const thirdDigit = parseInt(value.charAt(2));
    
    // RUC de persona natural
    if (thirdDigit < 6) {
        return isValidEcuadorianDNI(value.substring(0, 10)) && value.endsWith('001');
    }
    
    // RUC de empresa privada o extranjera
    if (thirdDigit === 9) {
        const digits = value.split('').map(Number);
        const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        
        for (let i = 0; i < 9; i++) {
            sum += digits[i] * coefficients[i];
        }
        
        const remainder = sum % 11;
        const checkDigit = remainder === 0 ? 0 : 11 - remainder;
        return checkDigit === digits[9] && value.endsWith('001');
    }
    
    return false;
};

// Validador para teléfonos ecuatorianos
const isValidEcuadorianPhone = (value) => {
    if (!value) return true; // Opcional
    
    // Remover espacios y guiones
    const cleanPhone = value.replace(/[\s-]/g, '');
    
    // Celular: 09XXXXXXXX (10 dígitos)
    // Convencional: 0XXXXXXX (8-9 dígitos, dependiendo de la provincia)
    return /^(09\d{8}|0[2-7]\d{6,7})$/.test(cleanPhone);
};

// ============================
// VALIDACIONES DE USUARIO/AUTH
// ============================

// Validaciones para registro básico
const validateRegisterBase = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres')
        .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
        .withMessage('El nombre solo debe contener letras y espacios'),
    
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email inválido')
        .isLength({ max: 255 })
        .withMessage('Email muy largo'),
    
    body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('La contraseña debe tener entre 8 y 128 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('La contraseña debe contener al menos: una minúscula, una mayúscula, un número y un símbolo'),
    
    body('phone')
        .optional()
        .custom(isValidEcuadorianPhone)
        .withMessage('Número de teléfono ecuatoriano inválido'),
    
    body('alternativePhone')
        .optional()
        .custom(isValidEcuadorianPhone)
        .withMessage('Número alternativo ecuatoriano inválido')
];

// Validaciones específicas para clientes
const validateClientInfo = [
    body('clientInfo.identificationNumber')
        .notEmpty()
        .withMessage('Número de identificación requerido')
        .custom((value, { req }) => {
            const type = req.body.clientInfo?.identificationType || 'DNI';
            
            if (type === 'DNI') {
                if (!isValidEcuadorianDNI(value)) {
                    throw new Error('DNI ecuatoriano inválido');
                }
            } else if (type === 'RUC') {
                if (!isValidEcuadorianRUC(value)) {
                    throw new Error('RUC ecuatoriano inválido');
                }
            } else if (type === 'passport') {
                if (!/^[A-Z0-9]{6,12}$/.test(value)) {
                    throw new Error('Número de pasaporte inválido');
                }
            }
            
            return true;
        }),
    
    body('clientInfo.identificationType')
        .isIn(['DNI', 'passport', 'RUC'])
        .withMessage('Tipo de identificación inválido'),
    
    body('clientInfo.customerType')
        .optional()
        .isIn(['residential', 'business', 'corporate'])
        .withMessage('Tipo de cliente inválido'),
    
    body('address.street')
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage('Dirección debe tener entre 5 y 200 caracteres'),
    
    body('address.city')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Ciudad debe tener entre 2 y 100 caracteres'),
    
    body('address.state')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Provincia debe tener entre 2 y 100 caracteres'),
    
    body('address.zipCode')
        .optional()
        .matches(/^\d{6}$/)
        .withMessage('Código postal debe tener 6 dígitos')
];

// Validaciones para empleados
const validateEmployeeInfo = [
    body('employeeInfo.employeeId')
        .matches(/^[A-Z]{2,3}\d{3,6}$/)
        .withMessage('ID de empleado inválido (ej: EMP001, TEC123)'),
    
    body('employeeInfo.department')
        .isIn(['technical', 'billing', 'customer_service', 'management', 'operations'])
        .withMessage('Departamento inválido'),
    
    body('employeeInfo.hireDate')
        .isISO8601()
        .withMessage('Fecha de contratación inválida'),
    
    body('employeeInfo.salary')
        .optional()
        .isFloat({ min: 400, max: 10000 })
        .withMessage('Salario debe estar entre $400 y $10,000')
];

// Validaciones para login
const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email inválido'),
    
    body('password')
        .notEmpty()
        .withMessage('Contraseña requerida'),
    
    handleValidationErrors
];

// Validaciones para cambio de contraseña
const validateChangePassword = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Contraseña actual requerida'),
    
    body('newPassword')
        .isLength({ min: 8, max: 128 })
        .withMessage('La nueva contraseña debe tener entre 8 y 128 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('La nueva contraseña debe contener al menos: una minúscula, una mayúscula, un número y un símbolo'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Las contraseñas no coinciden');
            }
            return true;
        }),
    
    handleValidationErrors
];

// ============================
// VALIDACIONES DE CÁMARA
// ============================

const validateCamera = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Nombre debe tener entre 2 y 100 caracteres'),
    
    body('ipAddress')
        .isIP()
        .withMessage('Dirección IP inválida'),
    
    body('port')
        .isInt({ min: 1, max: 65535 })
        .withMessage('Puerto debe ser entre 1 y 65535'),
    
    body('username')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Usuario debe tener entre 1 y 50 caracteres'),
    
    body('password')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Contraseña debe tener entre 1 y 100 caracteres'),
    
    body('model')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Modelo muy largo'),
    
    body('manufacturer')
        .optional()
        .isIn(['hikvision', 'dahua', 'axis', 'bosch', 'samsung', 'panasonic', 'sony', 'other'])
        .withMessage('Fabricante inválido'),
    
    body('location')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Ubicación debe tener entre 2 y 200 caracteres'),
    
    body('coordinates.latitude')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitud inválida'),
    
    body('coordinates.longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitud inválida'),
    
    body('resolution')
        .optional()
        .isIn(['720p', '1080p', '4K', '8K'])
        .withMessage('Resolución inválida'),
    
    body('monthlyFee')
        .optional()
        .isFloat({ min: 0, max: 500 })
        .withMessage('Tarifa mensual debe ser entre $0 y $500'),
    
    handleValidationErrors
];

// ============================
// VALIDACIONES DE SERVICIOS DE INTERNET
// ============================

const validateInternetService = [
    body('client')
        .isMongoId()
        .withMessage('ID de cliente inválido'),
    
    body('plan')
        .isMongoId()
        .withMessage('ID de plan inválido'),
    
    body('installation.scheduledDate')
        .optional()
        .isISO8601()
        .withMessage('Fecha de instalación inválida')
        .custom((value) => {
            const date = new Date(value);
            const now = new Date();
            if (date < now) {
                throw new Error('Fecha de instalación no puede ser en el pasado');
            }
            return true;
        }),
    
    body('connection.ipAddress')
        .optional()
        .isIP()
        .withMessage('Dirección IP inválida'),
    
    body('connection.connectionType')
        .optional()
        .isIn(['fiber', 'cable', 'wireless', 'satellite', 'dsl'])
        .withMessage('Tipo de conexión inválido'),
    
    body('contract.duration')
        .optional()
        .isInt({ min: 1, max: 60 })
        .withMessage('Duración debe ser entre 1 y 60 meses'),
    
    body('billing.monthlyFee')
        .optional()
        .isFloat({ min: 5, max: 1000 })
        .withMessage('Tarifa mensual debe ser entre $5 y $1000'),
    
    body('billing.billingCycle')
        .optional()
        .isIn(['monthly', 'quarterly', 'biannual', 'annual'])
        .withMessage('Ciclo de facturación inválido'),
    
    body('billing.billingDay')
        .optional()
        .isInt({ min: 1, max: 28 })
        .withMessage('Día de facturación debe ser entre 1 y 28'),
    
    handleValidationErrors
];

// ============================
// VALIDACIONES DE PAGOS
// ============================

const validatePayment = [
    body('client')
        .isMongoId()
        .withMessage('ID de cliente inválido'),
    
    body('services')
        .isArray({ min: 1 })
        .withMessage('Debe incluir al menos un servicio'),
    
    body('services.*.service')
        .isMongoId()
        .withMessage('ID de servicio inválido'),
    
    body('services.*.amount')
        .isFloat({ min: 0.01 })
        .withMessage('Monto debe ser mayor a $0.01'),
    
    body('services.*.billingPeriod.start')
        .isISO8601()
        .withMessage('Fecha de inicio del período inválida'),
    
    body('services.*.billingPeriod.end')
        .isISO8601()
        .withMessage('Fecha de fin del período inválida')
        .custom((value, { req }) => {
            const startDate = new Date(req.body.services[req.path.split('.')[1]].billingPeriod.start);
            const endDate = new Date(value);
            if (endDate <= startDate) {
                throw new Error('Fecha de fin debe ser posterior a fecha de inicio');
            }
            return true;
        }),
    
    body('paymentMethod')
        .optional()
        .isIn(['cash', 'transfer', 'card', 'check', 'online'])
        .withMessage('Método de pago inválido'),
    
    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Fecha de vencimiento inválida')
        .custom((value) => {
            const dueDate = new Date(value);
            const now = new Date();
            if (dueDate < now) {
                throw new Error('Fecha de vencimiento no puede ser en el pasado');
            }
            return true;
        }),
    
    body('additionalCharges.*.amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Monto de cargo adicional debe ser positivo'),
    
    body('discounts.*.amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Monto de descuento debe ser positivo'),
    
    handleValidationErrors
];

const validateProcessPayment = [
    body('paymentMethod')
        .isIn(['cash', 'transfer', 'card', 'check', 'online'])
        .withMessage('Método de pago inválido'),
    
    body('amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Monto debe ser mayor a $0.01'),
    
    body('transactionId')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('ID de transacción debe tener entre 1 y 100 caracteres'),
    
    body('bankName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Nombre del banco requerido'),
    
    handleValidationErrors
];

// ============================
// VALIDACIONES DE PLANES DE INTERNET
// ============================

const validateInternetPlan = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Nombre debe tener entre 2 y 100 caracteres'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Descripción muy larga'),
    
    body('speed.download')
        .isInt({ min: 1, max: 10000 })
        .withMessage('Velocidad de descarga debe ser entre 1 y 10000 Mbps'),
    
    body('speed.upload')
        .isInt({ min: 1, max: 10000 })
        .withMessage('Velocidad de subida debe ser entre 1 y 10000 Mbps'),
    
    body('price.monthly')
        .isFloat({ min: 5, max: 1000 })
        .withMessage('Precio mensual debe ser entre $5 y $1000'),
    
    body('price.installation')
        .optional()
        .isFloat({ min: 0, max: 500 })
        .withMessage('Costo de instalación debe ser entre $0 y $500'),
    
    body('connectionType')
        .isIn(['fiber', 'cable', 'wireless', 'satellite', 'dsl'])
        .withMessage('Tipo de conexión inválido'),
    
    body('dataLimit')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Límite de datos debe ser positivo'),
    
    body('contractDuration')
        .optional()
        .isInt({ min: 1, max: 60 })
        .withMessage('Duración de contrato debe ser entre 1 y 60 meses'),
    
    handleValidationErrors
];

// ============================
// VALIDACIONES DE PARÁMETROS
// ============================

const validateMongoId = (paramName) => [
    param(paramName)
        .isMongoId()
        .withMessage(`${paramName} inválido`),
    handleValidationErrors
];

const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Página debe ser entre 1 y 10000'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Límite debe ser entre 1 y 100'),
    
    query('sortBy')
        .optional()
        .matches(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)
        .withMessage('Campo de ordenamiento inválido'),
    
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Orden debe ser asc o desc')
];

const validateDateRange = [
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Fecha de inicio inválida'),
    
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('Fecha de fin inválida')
        .custom((value, { req }) => {
            if (req.query.startDate && value) {
                const startDate = new Date(req.query.startDate);
                const endDate = new Date(value);
                if (endDate <= startDate) {
                    throw new Error('Fecha de fin debe ser posterior a fecha de inicio');
                }
            }
            return true;
        })
];

// ============================
// VALIDACIONES COMBINADAS
// ============================

const validateRegisterClient = [
    ...validateRegisterBase,
    ...validateClientInfo,
    handleValidationErrors
];

const validateRegisterEmployee = [
    ...validateRegisterBase,
    body('role')
        .isIn(['technician', 'operator', 'supervisor', 'billing'])
        .withMessage('Rol de empleado inválido'),
    ...validateEmployeeInfo,
    handleValidationErrors
];

const validateUpdateProfile = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Nombre debe tener entre 2 y 100 caracteres'),
    
    body('phone')
        .optional()
        .custom(isValidEcuadorianPhone)
        .withMessage('Número de teléfono ecuatoriano inválido'),
    
    body('alternativePhone')
        .optional()
        .custom(isValidEcuadorianPhone)
        .withMessage('Número alternativo ecuatoriano inválido'),
    
    handleValidationErrors
];

// ============================
// EXPORTACIONES
// ============================

module.exports = {
    // Middleware
    handleValidationErrors,
    
    // Auth/Usuario
    validateLogin,
    validateRegisterClient,
    validateRegisterEmployee,
    validateChangePassword,
    validateUpdateProfile,
    
    // Cámara
    validateCamera,
    
    // Servicios de Internet
    validateInternetService,
    validateInternetPlan,
    
    // Pagos
    validatePayment,
    validateProcessPayment,
    
    // Utilidades
    validateMongoId,
    validatePagination,
    validateDateRange,
    
    // Validadores personalizados
    isValidEcuadorianDNI,
    isValidEcuadorianRUC,
    isValidEcuadorianPhone
};
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth, requireRole, requireOwnership } = require('../middleware/auth');
const {
    getPayments,
    getPayment,
    createPayment,
    processPayment,
    addPartialPayment,
    processRefund,
    getOverduePayments,
    getPaymentStats,
    getRevenueReport,
    getClientPaymentHistory
} = require('../controllers/paymentController');

// ============================
// VALIDACIONES REUTILIZABLES
// ============================

// Validaciones para crear pago/factura
const createPaymentValidation = [
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
        .withMessage('Monto debe ser mayor a 0'),
    body('services.*.billingPeriod.start')
        .isISO8601()
        .withMessage('Fecha de inicio del período inválida'),
    body('services.*.billingPeriod.end')
        .isISO8601()
        .withMessage('Fecha de fin del período inválida'),
    body('additionalCharges')
        .optional()
        .isArray()
        .withMessage('Cargos adicionales debe ser un array'),
    body('additionalCharges.*.description')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Descripción de cargo requerida'),
    body('additionalCharges.*.amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Monto de cargo debe ser positivo'),
    body('discounts')
        .optional()
        .isArray()
        .withMessage('Descuentos debe ser un array'),
    body('discounts.*.description')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Descripción de descuento requerida'),
    body('discounts.*.amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Monto de descuento debe ser positivo'),
    body('paymentMethod')
        .optional()
        .isIn(['cash', 'transfer', 'card', 'check', 'online'])
        .withMessage('Método de pago inválido'),
    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Fecha de vencimiento inválida'),
    body('billingAddress.street')
        .optional()
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage('Dirección debe tener entre 5 y 200 caracteres'),
    body('notes.internal')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Notas internas no pueden exceder 1000 caracteres'),
    body('notes.customer')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Notas al cliente no pueden exceder 500 caracteres')
];

// Validaciones para procesar pago
const processPaymentValidation = [
    body('paymentMethod')
        .isIn(['cash', 'transfer', 'card', 'check', 'online'])
        .withMessage('Método de pago inválido'),
    body('transactionId')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('ID de transacción debe tener entre 1 y 100 caracteres'),
    body('amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Monto debe ser mayor a 0'),
    body('bankName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Nombre del banco requerido'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Notas no pueden exceder 500 caracteres')
];

// Validaciones para pago parcial
const partialPaymentValidation = [
    body('amount')
        .isFloat({ min: 0.01 })
        .withMessage('Monto debe ser mayor a 0'),
    body('paymentMethod')
        .isIn(['cash', 'transfer', 'card', 'check', 'online'])
        .withMessage('Método de pago inválido'),
    body('transactionId')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('ID de transacción debe tener entre 1 y 100 caracteres'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Notas no pueden exceder 500 caracteres')
];

// Validaciones para reembolso
const refundValidation = [
    body('amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Monto debe ser mayor a 0'),
    body('reason')
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage('Razón del reembolso debe tener entre 5 y 500 caracteres')
];

// Validación de parámetros
const validatePaymentId = [
    param('id')
        .isMongoId()
        .withMessage('ID de pago inválido')
];

const validateClientId = [
    param('clientId')
        .isMongoId()
        .withMessage('ID de cliente inválido')
];

// ============================
// RUTAS PRINCIPALES (CRUD)
// ============================

// @route   GET /api/payments
// @desc    Obtener pagos con filtros y paginación
// @access  Private (Clientes ven solo los suyos)
router.get('/', [
    auth,
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded', 'partial']).withMessage('Estado inválido'),
    query('paymentMethod').optional().isIn(['cash', 'transfer', 'card', 'check', 'online']).withMessage('Método de pago inválido'),
    query('clientId').optional().isMongoId().withMessage('ID de cliente inválido'),
    query('startDate').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('endDate').optional().isISO8601().withMessage('Fecha de fin inválida'),
    query('search').optional().trim().isLength({ min: 1 }).withMessage('Término de búsqueda requerido')
], getPayments);

// @route   GET /api/payments/:id
// @desc    Obtener un pago específico
// @access  Private (Solo propietario o staff)
router.get('/:id', [
    auth,
    validatePaymentId,
    requireOwnership('client')
], getPayment);

// @route   POST /api/payments
// @desc    Crear nueva factura/recibo
// @access  Private (Admin, Supervisor, Billing)
router.post('/', [
    auth,
    requireRole(['admin', 'supervisor', 'billing']),
    createPaymentValidation
], createPayment);

// ============================
// PROCESAMIENTO DE PAGOS
// ============================

// @route   POST /api/payments/:id/process
// @desc    Procesar pago (marcar como pagado)
// @access  Private (Admin, Supervisor, Billing)
router.post('/:id/process', [
    auth,
    requireRole(['admin', 'supervisor', 'billing']),
    validatePaymentId,
    processPaymentValidation
], processPayment);

// @route   POST /api/payments/:id/partial
// @desc    Agregar pago parcial/abono
// @access  Private (Admin, Supervisor, Billing)
router.post('/:id/partial', [
    auth,
    requireRole(['admin', 'supervisor', 'billing']),
    validatePaymentId,
    partialPaymentValidation
], addPartialPayment);

// @route   POST /api/payments/:id/refund
// @desc    Procesar reembolso
// @access  Private (Admin, Supervisor)
router.post('/:id/refund', [
    auth,
    requireRole(['admin', 'supervisor']),
    validatePaymentId,
    refundValidation
], processRefund);

// ============================
// REPORTES Y ESTADÍSTICAS
// ============================

// @route   GET /api/payments/stats
// @desc    Obtener estadísticas de pagos
// @access  Private (Admin, Supervisor, Billing, Operator)
router.get('/stats', [
    auth,
    requireRole(['admin', 'supervisor', 'billing', 'operator']),
    query('period').optional().isIn(['today', 'week', 'month', 'year']).withMessage('Período inválido')
], getPaymentStats);

// @route   GET /api/payments/revenue-report
// @desc    Reporte detallado de ingresos
// @access  Private (Admin, Supervisor, Billing)
router.get('/revenue-report', [
    auth,
    requireRole(['admin', 'supervisor', 'billing']),
    query('startDate').isISO8601().withMessage('Fecha de inicio requerida'),
    query('endDate').isISO8601().withMessage('Fecha de fin requerida'),
    query('groupBy').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Agrupación inválida')
], getRevenueReport);

// @route   GET /api/payments/overdue
// @desc    Obtener pagos vencidos/morosos
// @access  Private (Admin, Supervisor, Billing, Operator)
router.get('/overdue', [
    auth,
    requireRole(['admin', 'supervisor', 'billing', 'operator'])
], getOverduePayments);

// ============================
// HISTORIAL Y CONSULTAS
// ============================

// @route   GET /api/payments/client/:clientId
// @desc    Historial de pagos por cliente
// @access  Private (Staff o el propio cliente)
router.get('/client/:clientId', [
    auth,
    validateClientId,
    requireOwnership('clientId')
], getClientPaymentHistory);

// @route   GET /api/payments/my-payments
// @desc    Pagos del cliente actual
// @access  Private (Solo clientes)
router.get('/my-payments', [
    auth,
    requireRole(['client'])
], (req, res, next) => {
    // Forzar filtro por cliente actual
    req.query.clientId = req.user.id;
    getPayments(req, res, next);
});

// ============================
// BÚSQUEDA Y FILTROS AVANZADOS
// ============================

// @route   GET /api/payments/search
// @desc    Búsqueda avanzada de pagos
// @access  Private (Staff)
router.get('/search', [
    auth,
    requireRole(['admin', 'supervisor', 'billing', 'operator']),
    query('q').trim().isLength({ min: 1 }).withMessage('Término de búsqueda requerido'),
    query('searchType').optional().isIn(['receiptNumber', 'transactionId', 'customerCode', 'all']).withMessage('Tipo de búsqueda inválido')
], (req, res, next) => {
    // Configurar parámetros de búsqueda
    const { q, searchType = 'all' } = req.query;
    req.query.search = q;
    req.query.searchType = searchType;
    getPayments(req, res, next);
});

// ============================
// ANÁLISIS FINANCIERO
// ============================

// @route   GET /api/payments/dashboard
// @desc    Dashboard financiero resumido
// @access  Private (Admin, Supervisor, Billing)
router.get('/dashboard', [
    auth,
    requireRole(['admin', 'supervisor', 'billing'])
], async (req, res) => {
    try {
        const Payment = require('../models/Payment');
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        
        // Estadísticas rápidas
        const [
            todayStats,
            monthStats,
            yearStats,
            overdueCount,
            recentPayments
        ] = await Promise.all([
            // Pagos de hoy
            Payment.aggregate([
                {
                    $match: {
                        paymentDate: {
                            $gte: new Date(today.setHours(0, 0, 0, 0)),
                            $lte: new Date(today.setHours(23, 59, 59, 999))
                        },
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$totalAmount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Pagos del mes
            Payment.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: startOfMonth },
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$totalAmount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Pagos del año
            Payment.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: startOfYear },
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$totalAmount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Pagos vencidos
            Payment.countDocuments({
                status: 'pending',
                dueDate: { $lt: new Date() }
            }),
            // Pagos recientes
            Payment.find({ status: 'completed' })
                .populate('client', 'name clientInfo.customerCode')
                .sort({ paymentDate: -1 })
                .limit(5)
                .select('receiptNumber totalAmount paymentDate paymentMethod')
        ]);
        
        res.json({
            success: true,
            dashboard: {
                today: todayStats[0] || { totalAmount: 0, count: 0 },
                month: monthStats[0] || { totalAmount: 0, count: 0 },
                year: yearStats[0] || { totalAmount: 0, count: 0 },
                overdueCount,
                recentPayments
            }
        });
        
    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// @route   GET /api/payments/monthly-trends
// @desc    Tendencias mensuales de pagos
// @access  Private (Admin, Supervisor, Billing)
router.get('/monthly-trends', [
    auth,
    requireRole(['admin', 'supervisor', 'billing']),
    query('months').optional().isInt({ min: 1, max: 24 }).withMessage('Número de meses debe ser entre 1 y 24')
], async (req, res) => {
    try {
        const Payment = require('../models/Payment');
        const months = parseInt(req.query.months) || 12;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        
        const trends = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: startDate, $lte: endDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' }
                    },
                    totalRevenue: { $sum: '$totalAmount' },
                    paymentCount: { $sum: 1 },
                    averagePayment: { $avg: '$totalAmount' }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);
        
        res.json({
            success: true,
            trends,
            summary: {
                totalRevenue: trends.reduce((sum, item) => sum + item.totalRevenue, 0),
                totalPayments: trends.reduce((sum, item) => sum + item.paymentCount, 0),
                months: trends.length
            }
        });
        
    } catch (error) {
        console.error('Error en tendencias:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// ============================
// RUTAS ESPECÍFICAS POR ROL
// ============================

// @route   GET /api/payments/pending-approval
// @desc    Pagos pendientes de aprobación
// @access  Private (Admin, Supervisor)
router.get('/pending-approval', [
    auth,
    requireRole(['admin', 'supervisor'])
], (req, res, next) => {
    req.query.status = 'pending';
    req.query.sortBy = 'dueDate';
    req.query.sortOrder = 'asc';
    getPayments(req, res, next);
});

// @route   GET /api/payments/collection-report
// @desc    Reporte de cobranza para billing
// @access  Private (Admin, Supervisor, Billing)
router.get('/collection-report', [
    auth,
    requireRole(['admin', 'supervisor', 'billing'])
], async (req, res) => {
    try {
        const Payment = require('../models/Payment');
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const collectionReport = await Payment.aggregate([
            {
                $match: {
                    dueDate: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' }
                }
            }
        ]);
        
        const overdueAnalysis = await Payment.aggregate([
            {
                $match: {
                    status: 'pending',
                    dueDate: { $lt: now }
                }
            },
            {
                $addFields: {
                    daysOverdue: {
                        $divide: [
                            { $subtract: [now, '$dueDate'] },
                            1000 * 60 * 60 * 24
                        ]
                    }
                }
            },
            {
                $bucket: {
                    groupBy: '$daysOverdue',
                    boundaries: [0, 7, 15, 30, 60, 90, Infinity],
                    default: 'other',
                    output: {
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$totalAmount' }
                    }
                }
            }
        ]);
        
        res.json({
            success: true,
            collectionReport,
            overdueAnalysis
        });
        
    } catch (error) {
        console.error('Error en reporte de cobranza:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// ============================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================
router.use((error, req, res, next) => {
    if (error.type === 'validation') {
        return res.status(400).json({
            success: false,
            msg: 'Error de validación',
            errors: error.errors
        });
    }
    next(error);
});

module.exports = router;
const { validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const InternetService = require('../models/InternetService'); // ✅ CORRECTO
const User = require('../models/User');
const Invoice = require('../models/Invoice');

// Obtener pagos con filtros y paginación
exports.getPayments = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status, 
            paymentMethod,
            clientId,
            startDate,
            endDate,
            search,
            sortBy = 'paymentDate',
            sortOrder = 'desc'
        } = req.query;
        
        // Construir filtros según el rol
        let filters = {};
        
        if (req.user.role === 'client') {
            // Clientes solo ven sus pagos
            filters.client = req.user.id;
        } else if (['billing', 'operator'].includes(req.user.role)) {
            // Billing puede filtrar por cliente específico
            if (clientId) filters.client = clientId;
        }
        // Admin y supervisores ven todos sin restricción
        
        // Aplicar filtros adicionales
        if (status) filters.status = status;
        if (paymentMethod) filters.paymentMethod = paymentMethod;
        if (startDate || endDate) {
            filters.paymentDate = {};
            if (startDate) filters.paymentDate.$gte = new Date(startDate);
            if (endDate) filters.paymentDate.$lte = new Date(endDate);
        }
        if (search) {
            filters.$or = [
                { receiptNumber: { $regex: search, $options: 'i' } },
                { 'paymentDetails.transactionId': { $regex: search, $options: 'i' } }
            ];
        }
        
        // Opciones de paginación
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
        };
        
        const payments = await Payment.find(filters)
            .populate('client', 'name email phone clientInfo.customerCode')
            .populate('services.service', 'serviceCode plan')
            .populate('processedBy', 'name employeeInfo.employeeId')
            .sort(options.sort)
            .limit(options.limit * 1)
            .skip((options.page - 1) * options.limit);
            
        const total = await Payment.countDocuments(filters);
        
        res.json({
            success: true,
            payments,
            pagination: {
                currentPage: options.page,
                totalPages: Math.ceil(total / options.limit),
                totalPayments: total,
                hasNext: options.page < Math.ceil(total / options.limit),
                hasPrev: options.page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos:', error);
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Obtener un pago específico
exports.getPayment = async (req, res) => {
    try {
        const paymentId = req.params.id;
        
        const payment = await Payment.findById(paymentId)
            .populate('client', 'name email phone clientInfo address billingInfo')
            .populate('services.service', 'serviceCode plan status')
            .populate('processedBy', 'name employeeInfo')
            .populate('approvedBy', 'name employeeInfo');
        
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        // Verificar permisos
        if (req.user.role === 'client' && payment.client._id.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'No autorizado para ver este pago' });
        }
        
        res.json({
            success: true,
            payment
        });
        
    } catch (error) {
        console.error('Error obteniendo pago:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Crear nuevo pago/recibo
exports.createPayment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        // Solo admin, billing y supervisor pueden crear pagos
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { 
            client,
            services,
            additionalCharges,
            discounts,
            paymentMethod,
            paymentDetails,
            dueDate,
            notes,
            billingAddress
        } = req.body;
        
        // Verificar que el cliente existe
        const clientUser = await User.findById(client);
        if (!clientUser || clientUser.role !== 'client') {
            return res.status(400).json({ msg: 'Cliente no válido' });
        }
        
        // Verificar que los servicios existen y pertenecen al cliente
        const serviceIds = services.map(s => s.service);
        const existingServices = await InternetService.find({
            _id: { $in: serviceIds },
            client: client
        });
        
        if (existingServices.length !== services.length) {
            return res.status(400).json({ 
                msg: 'Algunos servicios no existen o no pertenecen al cliente' 
            });
        }
        
        // Crear datos del pago
        const paymentData = {
            client,
            services: services.map(service => ({
                service: service.service,
                plan: service.plan,
                amount: service.amount,
                billingPeriod: {
                    start: new Date(service.billingPeriod.start),
                    end: new Date(service.billingPeriod.end)
                }
            })),
            additionalCharges: additionalCharges || [],
            discounts: discounts || [],
            paymentMethod,
            paymentDetails: paymentDetails || {},
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días por defecto
            billingAddress: billingAddress || clientUser.address,
            processedBy: req.user.id,
            notes: {
                internal: notes?.internal,
                customer: notes?.customer
            }
        };
        
        // Agregar impuestos si están configurados
        const taxRate = process.env.TAX_RATE || 0.12; // 12% por defecto (Ecuador)
        if (taxRate > 0) {
            paymentData.taxes = [{
                name: 'IVA',
                rate: taxRate * 100,
                amount: paymentData.taxableAmount * taxRate
            }];
        }
        
        const payment = new Payment(paymentData);
        await payment.save();
        
        // Actualizar balances del cliente
        await User.findByIdAndUpdate(
            client,
            { 
                $inc: { 
                    'billingInfo.currentBalance': payment.totalAmount
                }
            }
        );
        
        // Poblar datos para respuesta
        await payment.populate([
            { path: 'client', select: 'name email clientInfo.customerCode' },
            { path: 'services.service', select: 'serviceCode plan' },
            { path: 'processedBy', select: 'name employeeInfo.employeeId' }
        ]);
        
        res.status(201).json({
            success: true,
            msg: 'Pago/recibo creado exitosamente',
            payment
        });
        
    } catch (error) {
        console.error('Error creando pago:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({ 
                msg: 'Ya existe un pago con ese número de recibo' 
            });
        }
        
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Procesar pago (marcar como pagado)
exports.processPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            paymentMethod, 
            transactionId, 
            amount, 
            bankName,
            notes 
        } = req.body;
        
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const payment = await Payment.findById(id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        if (payment.status === 'completed') {
            return res.status(400).json({ msg: 'El pago ya está completado' });
        }
        
        // Procesar pago completo o parcial
        const paidAmount = amount || payment.totalAmount;
        
        if (paidAmount >= payment.totalAmount) {
            // Pago completo
            payment.status = 'completed';
            payment.paymentDate = new Date();
            payment.paymentMethod = paymentMethod;
            payment.paymentDetails = {
                transactionId,
                bankName,
                ...payment.paymentDetails
            };
        } else {
            // Pago parcial
            await payment.addPartialPayment(paidAmount, paymentMethod, transactionId, notes);
        }
        
        payment.processedBy = req.user.id;
        if (notes) {
            payment.notes.internal = payment.notes.internal ? 
                `${payment.notes.internal}\n${new Date().toISOString()}: ${notes}` : notes;
        }
        
        await payment.save();
        
        // Actualizar balance del cliente
        await User.findByIdAndUpdate(
            payment.client,
            { 
                $inc: { 
                    'billingInfo.currentBalance': -paidAmount
                }
            }
        );
        
        res.json({
            success: true,
            msg: payment.status === 'completed' ? 'Pago procesado exitosamente' : 'Pago parcial registrado',
            payment: {
                id: payment._id,
                receiptNumber: payment.receiptNumber,
                status: payment.status,
                totalAmount: payment.totalAmount,
                paidAmount: paidAmount
            }
        });
        
    } catch (error) {
        console.error('Error procesando pago:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Agregar pago parcial
exports.addPartialPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethod, transactionId, notes } = req.body;
        
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const payment = await Payment.findById(id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        if (payment.status === 'completed') {
            return res.status(400).json({ msg: 'El pago ya está completado' });
        }
        
        await payment.addPartialPayment(amount, paymentMethod, transactionId, notes);
        
        res.json({
            success: true,
            msg: 'Pago parcial agregado exitosamente',
            payment: {
                id: payment._id,
                status: payment.status,
                partialPayments: payment.partialPayments
            }
        });
        
    } catch (error) {
        console.error('Error agregando pago parcial:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Procesar reembolso
exports.processRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, reason } = req.body;
        
        if (!['admin', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const payment = await Payment.findById(id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        if (payment.status !== 'completed') {
            return res.status(400).json({ msg: 'Solo se pueden reembolsar pagos completados' });
        }
        
        if (payment.refund.isRefunded) {
            return res.status(400).json({ msg: 'El pago ya fue reembolsado' });
        }
        
        await payment.processRefund(amount || payment.totalAmount, reason, req.user.id);
        
        // Actualizar balance del cliente
        await User.findByIdAndUpdate(
            payment.client,
            { 
                $inc: { 
                    'billingInfo.currentBalance': payment.refund.refundAmount
                }
            }
        );
        
        res.json({
            success: true,
            msg: 'Reembolso procesado exitosamente',
            refund: payment.refund
        });
        
    } catch (error) {
        console.error('Error procesando reembolso:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener pagos vencidos
exports.getOverduePayments = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'billing', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const overduePayments = await Payment.find({
            status: 'pending',
            dueDate: { $lt: new Date() }
        })
        .populate('client', 'name phone email clientInfo.customerCode address')
        .populate('services.service', 'serviceCode status')
        .sort({ dueDate: 1 });
        
        // Calcular días de mora para cada pago
        const paymentsWithOverdue = overduePayments.map(payment => {
            const daysOverdue = payment.getDaysOverdue();
            return {
                ...payment.toObject(),
                daysOverdue
            };
        });
        
        res.json({
            success: true,
            overduePayments: paymentsWithOverdue,
            count: overduePayments.length
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos vencidos:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener estadísticas de pagos
exports.getPaymentStats = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'billing', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { period = 'month' } = req.query;
        const now = new Date();
        let startDate, endDate;
        
        switch (period) {
            case 'today':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                endDate = new Date(now.setHours(23, 59, 59, 999));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                endDate = new Date();
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        
        const stats = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalPayments: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' },
                    completedPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    completedAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalAmount', 0] }
                    },
                    pendingPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    pendingAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalAmount', 0] }
                    },
                    failedPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                    },
                    totalTaxes: { $sum: '$totalTaxes' },
                    totalDiscounts: { $sum: '$totalDiscounts' }
                }
            }
        ]);
        
        const paymentMethodStats = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: startDate, $lte: endDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    amount: { $sum: '$totalAmount' }
                }
            },
            { $sort: { amount: -1 } }
        ]);
        
        const overdueCount = await Payment.countDocuments({
            status: 'pending',
            dueDate: { $lt: new Date() }
        });
        
        res.json({
            success: true,
            period,
            dateRange: { startDate, endDate },
            stats: stats[0] || {
                totalPayments: 0,
                totalAmount: 0,
                completedPayments: 0,
                completedAmount: 0,
                pendingPayments: 0,
                pendingAmount: 0,
                failedPayments: 0,
                totalTaxes: 0,
                totalDiscounts: 0
            },
            paymentMethodBreakdown: paymentMethodStats,
            overdueCount
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Generar reporte de ingresos
exports.getRevenueReport = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { startDate, endDate, groupBy = 'month' } = req.query;
        
        const matchStage = {
            status: 'completed',
            paymentDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };
        
        let groupStage = {};
        switch (groupBy) {
            case 'day':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' },
                        day: { $dayOfMonth: '$paymentDate' }
                    }
                };
                break;
            case 'week':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        week: { $week: '$paymentDate' }
                    }
                };
                break;
            case 'month':
                groupStage = {
                    _id: {
                        year: { $year: '$paymentDate' },
                        month: { $month: '$paymentDate' }
                    }
                };
                break;
            case 'year':
                groupStage = {
                    _id: { year: { $year: '$paymentDate' } }
                };
                break;
        }
        
        groupStage.revenue = { $sum: '$totalAmount' };
        groupStage.count = { $sum: 1 };
        groupStage.taxes = { $sum: '$totalTaxes' };
        groupStage.discounts = { $sum: '$totalDiscounts' };
        
        const revenueData = await Payment.aggregate([
            { $match: matchStage },
            { $group: groupStage },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ]);
        
        res.json({
            success: true,
            revenueReport: revenueData,
            summary: {
                totalRevenue: revenueData.reduce((sum, item) => sum + item.revenue, 0),
                totalPayments: revenueData.reduce((sum, item) => sum + item.count, 0),
                totalTaxes: revenueData.reduce((sum, item) => sum + item.taxes, 0),
                totalDiscounts: revenueData.reduce((sum, item) => sum + item.discounts, 0)
            }
        });
        
    } catch (error) {
        console.error('Error generando reporte:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener historial de pagos por cliente
exports.getClientPaymentHistory = async (req, res) => {
    try {
        const { clientId } = req.params;
        
        // Verificar permisos
        if (req.user.role === 'client' && req.user.id !== clientId) {
            return res.status(403).json({ msg: 'No autorizado' });
        }
        
        if (!['admin', 'supervisor', 'billing', 'operator'].includes(req.user.role) && req.user.id !== clientId) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const payments = await Payment.find({ client: clientId })
            .populate('services.service', 'serviceCode plan')
            .sort({ paymentDate: -1 });
            
        const summary = await Payment.aggregate([
            { $match: { client: clientId } },
            {
                $group: {
                    _id: null,
                    totalPaid: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalAmount', 0] }
                    },
                    totalPending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalAmount', 0] }
                    },
                    totalPayments: { $sum: 1 },
                    lastPayment: { $max: '$paymentDate' }
                }
            }
        ]);
        
        res.json({
            success: true,
            payments,
            summary: summary[0] || {
                totalPaid: 0,
                totalPending: 0,
                totalPayments: 0,
                lastPayment: null
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};
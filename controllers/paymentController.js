const { validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const InternetService = require('../models/InternetService'); // ✅ CORRECTO
const User = require('../models/User');
const Invoice = require('../models/Invoice');

// Obtener todos los pagos (admin) o pagos del usuario
exports.getPayments = async (req, res) => {
    try {
        let payments;
        
        if (req.user.role === 'admin') {
            payments = await Payment.find()
                .populate('client', 'name email')
                .populate('service', 'plan monthlyCost')
                .sort({ paymentDate: -1 });
        } else {
            payments = await Payment.find({ client: req.user.id })
                .populate('service', 'plan monthlyCost')
                .sort({ paymentDate: -1 });
        }
        
        res.json(payments);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener un pago específico
exports.getPayment = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate('client', 'name email')
            .populate('service', 'plan monthlyCost');
        
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        // Verificar que el pago pertenezca al usuario o sea admin
        if (payment.client._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Crear nuevo pago
exports.createPayment = async (req, res) => {
    try {
        const { 
            serviceId, 
            amount, 
            paymentMethod, 
            transactionId, 
            billingPeriod, 
            notes 
        } = req.body;
        
        // Verificar que el servicio existe
        const service = await InternetService.findById(serviceId);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        // Si no es admin, verificar que el servicio pertenezca al usuario
        if (req.user.role !== 'admin' && service.client.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        const newPayment = new Payment({
            client: req.user.role === 'admin' ? service.client : req.user.id,
            service: serviceId,
            amount,
            paymentMethod,
            transactionId,
            billingPeriod,
            notes,
            status: 'completed'
        });
        
        const payment = await newPayment.save();
        await payment.populate('client', 'name email');
        await payment.populate('service', 'plan monthlyCost');
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Actualizar estado de pago (solo admin)
exports.updatePaymentStatus = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { status, notes } = req.body;
        
        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { status, notes },
            { new: true }
        ).populate('client', 'name email').populate('service', 'plan monthlyCost');
        
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener historial de pagos por servicio
exports.getPaymentsByService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        
        // Verificar que el servicio existe
        const service = await InternetService.findById(serviceId);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        // Verificar permisos
        if (req.user.role !== 'admin' && service.client.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        const payments = await Payment.find({ service: serviceId })
            .populate('client', 'name email')
            .sort({ paymentDate: -1 });
        
        res.json(payments);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener estadísticas de pagos (solo admin)
exports.getPaymentStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        // Pagos de este mes
        const thisMonthPayments = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: thisMonth },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Pagos del mes anterior
        const lastMonthPayments = await Payment.aggregate([
            {
                $match: {
                    paymentDate: { $gte: lastMonth, $lt: thisMonth },
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
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        res.json({
            thisMonth: thisMonthPayments[0] || { total: 0, count: 0 },
            lastMonth: lastMonthPayments[0] || { total: 0, count: 0 }
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};
// Procesar pago (marcar como pagado)
exports.processPayment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { paymentMethod, transactionId, amount, notes } = req.body;
        
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }

        payment.status = 'completed';
        payment.paymentMethod = paymentMethod;
        payment.transactionId = transactionId;
        payment.paymentDate = new Date();
        if (amount) payment.amount = amount;
        if (notes) payment.notes = notes;

        await payment.save();
        await payment.populate('client', 'name email');
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Agregar pago parcial
exports.addPartialPayment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { amount, paymentMethod, transactionId, notes } = req.body;
        
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }

        // Agregar el pago parcial
        payment.partialPayments = payment.partialPayments || [];
        payment.partialPayments.push({
            amount,
            paymentMethod,
            transactionId,
            paymentDate: new Date(),
            notes
        });

        // Actualizar estado si se completó
        const totalPaid = payment.partialPayments.reduce((sum, partial) => sum + partial.amount, 0);
        if (totalPaid >= payment.amount) {
            payment.status = 'completed';
        } else {
            payment.status = 'partial';
        }

        await payment.save();
        await payment.populate('client', 'name email');
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Procesar reembolso
exports.processRefund = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { amount, reason } = req.body;
        
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ msg: 'Pago no encontrado' });
        }

        payment.status = 'refunded';
        payment.refundAmount = amount || payment.amount;
        payment.refundReason = reason;
        payment.refundDate = new Date();

        await payment.save();
        await payment.populate('client', 'name email');
        
        res.json(payment);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener pagos vencidos
exports.getOverduePayments = async (req, res) => {
    try {
        const overduePayments = await Payment.find({
            status: 'pending',
            dueDate: { $lt: new Date() }
        })
        .populate('client', 'name email')
        .populate('service', 'plan monthlyCost')
        .sort({ dueDate: 1 });

        res.json({
            success: true,
            count: overduePayments.length,
            payments: overduePayments
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};
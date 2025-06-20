const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const InternetService = mongoose.models.InternetService || require('../models/InternetService');
const InternetPlan = require('../models/InternetPlan');

// Middleware simple de autenticación (ajustar según tu implementación)
const auth = (req, res, next) => {
    // Si no tienes middleware de auth aún, usar esto temporalmente
    req.user = { id: 'USER_ID_TEMPORAL' }; // Cambiar por tu lógica real
    next();
};

// GET /api/services/my-dashboard - Dashboard del cliente
router.get('/my-dashboard', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Buscar el servicio activo del usuario
        const service = await InternetService.findOne({ 
            client: userId,
            status: { $in: ['active', 'suspended', 'maintenance'] }
        })
        .populate('plan', 'name speed dataLimit price features customerType')
        .populate('client', 'name email phone')
        .sort({ createdAt: -1 });
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró un servicio activo'
            });
        }

        // Calcular porcentaje de uso de datos
        const dataUsagePercentage = service.plan.dataLimit > 0 
            ? Math.round((service.dataUsage.currentMonth.total / service.plan.dataLimit) * 100)
            : 0;

        // Calcular costo mensual actual
        let monthlyCost = service.billing.monthlyFee;
        if (typeof service.getCurrentMonthlyCost === 'function') {
            monthlyCost = await service.getCurrentMonthlyCost();
        }

        // Preparar respuesta del dashboard
        const dashboardData = {
            service: {
                code: service.serviceCode,
                status: service.status,
                statusText: getStatusText(service.status),
                statusColor: getStatusColor(service.status),
                uptime: service.monitoring.uptime,
                isMonitored: service.monitoring.isMonitored
            },
            
            plan: {
                name: service.plan.name,
                speed: {
                    download: service.plan.speed.download,
                    upload: service.plan.speed.upload,
                    downloadText: `${service.plan.speed.download} Mbps`,
                    uploadText: `${service.plan.speed.upload} Mbps`
                },
                price: service.plan.price.monthly,
                features: service.plan.features || [],
                customerType: service.plan.customerType
            },
            
            dataUsage: {
                current: service.dataUsage.currentMonth.total || 0,
                limit: service.plan.dataLimit,
                percentage: dataUsagePercentage,
                download: service.dataUsage.currentMonth.download || 0,
                upload: service.dataUsage.currentMonth.upload || 0,
                isUnlimited: service.plan.dataLimit === 0,
                warningThreshold: service.dataUsage.warningThreshold || 80,
                lastUpdated: service.dataUsage.currentMonth.lastUpdated
            },
            
            billing: {
                nextBillingDate: service.billing.nextBillingDate,
                monthlyFee: monthlyCost,
                outstandingBalance: service.billing.outstandingBalance || 0,
                billingCycle: service.billing.billingCycle,
                daysUntilBilling: service.billing.nextBillingDate ? 
                    Math.ceil((new Date(service.billing.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0
            },
            
            lastSpeedTest: service.connection.lastSpeedTest ? {
                download: service.connection.lastSpeedTest.download,
                upload: service.connection.lastSpeedTest.upload,
                ping: service.connection.lastSpeedTest.ping,
                testedAt: service.connection.lastSpeedTest.testedAt,
                testedBy: service.connection.lastSpeedTest.testedBy
            } : null,
            
            connection: {
                ipAddress: service.connection.ipAddress,
                connectionType: service.connection.connectionType,
                lastPing: service.monitoring.lastPing
            },
            
            alerts: getActiveAlerts(service),
            
            client: {
                name: service.client.name,
                email: service.client.email,
                phone: service.client.phone
            }
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

// GET /api/services - Obtener todos los servicios (para admin)
router.get('/', async (req, res) => {
    try {
        const services = await InternetService.find()
            .populate('plan', 'name speed price')
            .populate('client', 'name email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: services
        });
    } catch (error) {
        console.error('Error obteniendo servicios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Función auxiliar para texto del estado
function getStatusText(status) {
    const statusTexts = {
        'active': 'Activo',
        'suspended': 'Suspendido',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente de Instalación',
        'cancelled': 'Cancelado',
        'pending_cancellation': 'Pendiente de Cancelación'
    };
    return statusTexts[status] || 'Estado Desconocido';
}

// Función auxiliar para color del estado
function getStatusColor(status) {
    const statusColors = {
        'active': 'green',
        'suspended': 'red',
        'maintenance': 'orange',
        'pending_installation': 'blue',
        'cancelled': 'gray',
        'pending_cancellation': 'orange'
    };
    return statusColors[status] || 'gray';
}

// Función auxiliar para obtener alertas activas
function getActiveAlerts(service) {
    const alerts = [];
    
    if (service.billing.outstandingBalance > 0) {
        alerts.push({
            type: 'warning',
            title: 'Saldo Pendiente',
            message: `Tienes un saldo pendiente de $${service.billing.outstandingBalance}`,
            action: 'Ver Facturación'
        });
    }
    
    if (service.plan.dataLimit > 0) {
        const percentage = (service.dataUsage.currentMonth.total / service.plan.dataLimit) * 100;
        if (percentage >= (service.dataUsage.warningThreshold || 80)) {
            alerts.push({
                type: 'info',
                title: 'Uso de Datos',
                message: `Has usado ${percentage.toFixed(1)}% de tus datos mensuales`,
                action: 'Ver Detalles'
            });
        }
    }
    
    if (service.status === 'maintenance') {
        alerts.push({
            type: 'info',
            title: 'Mantenimiento',
            message: 'Tu servicio está en mantenimiento programado',
            action: 'Más Info'
        });
    }
    
    return alerts;
}

module.exports = router;
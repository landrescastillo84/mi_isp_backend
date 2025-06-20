const { validationResult } = require('express-validator');
const InternetService = require('../models/InternetService'); // ✅ CORRECTO
const InternetPlan = require('../models/InternetPlan');
const User = require('../models/User');

// Obtener servicios con filtros y paginación
exports.getServices = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status, 
            clientId,
            planId,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Construir filtros según el rol
        let filters = {};
        
        if (req.user.role === 'client') {
            // Clientes solo ven sus servicios
            filters.client = req.user.id;
        } else if (['technician', 'operator'].includes(req.user.role)) {
            // Técnicos pueden filtrar por cliente específico
            if (clientId) filters.client = clientId;
        }
        // Admin y supervisores ven todos sin restricción
        
        // Aplicar filtros adicionales
        if (status) filters.status = status;
        if (planId) filters.plan = planId;
        if (search) {
            filters.$or = [
                { serviceCode: { $regex: search, $options: 'i' } },
                { 'connection.ipAddress': { $regex: search, $options: 'i' } }
            ];
        }
        
        // Opciones de paginación
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
        };
        
        const services = await InternetService.find(filters)
            .populate('client', 'name email phone clientInfo.customerCode address')
            .populate('plan', 'name speed price')
            .populate('installation.technician', 'name phone employeeInfo.employeeId')
            .sort(options.sort)
            .limit(options.limit * 1)
            .skip((options.page - 1) * options.limit);
            
        const total = await InternetService.countDocuments(filters);
        
        res.json({
            success: true,
            services,
            pagination: {
                currentPage: options.page,
                totalPages: Math.ceil(total / options.limit),
                totalServices: total,
                hasNext: options.page < Math.ceil(total / options.limit),
                hasPrev: options.page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo servicios:', error);
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Obtener un servicio específico
exports.getService = async (req, res) => {
    try {
        const serviceId = req.params.id;
        
        const service = await InternetService.findById(serviceId)
            .populate('client', 'name email phone clientInfo address billingInfo')
            .populate('plan', 'name description speed price features')
            .populate('installation.technician', 'name phone employeeInfo')
            .populate('installation.equipmentInstalled');
        
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        // Verificar permisos
        if (req.user.role === 'client' && service.client._id.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'No autorizado para ver este servicio' });
        }
        
        res.json({
            success: true,
            service
        });
        
    } catch (error) {
        console.error('Error obteniendo servicio:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Crear nuevo servicio
exports.createService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        // Solo admin, supervisor y billing pueden crear servicios
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { 
            client, 
            plan, 
            installation,
            connection,
            contract,
            billing,
            notes 
        } = req.body;
        
        // Verificar que el cliente existe y es válido
        const clientUser = await User.findById(client);
        if (!clientUser || clientUser.role !== 'client') {
            return res.status(400).json({ msg: 'Cliente no válido' });
        }
        
        // Verificar que el plan existe y está activo
        const internetPlan = await InternetPlan.findById(plan);
        if (!internetPlan || !internetPlan.isActive) {
            return res.status(400).json({ msg: 'Plan no válido o inactivo' });
        }
        
        // Verificar IP única (si se proporciona)
        if (connection?.ipAddress) {
            const existingService = await InternetService.findOne({ 
                'connection.ipAddress': connection.ipAddress,
                status: { $in: ['active', 'pending_installation'] }
            });
            if (existingService) {
                return res.status(400).json({ 
                    msg: 'Ya existe un servicio activo con esa IP' 
                });
            }
        }
        
        // Crear datos del servicio
        const serviceData = {
            client,
            plan,
            status: 'pending_installation',
            installation: {
                scheduledDate: installation?.scheduledDate,
                technician: installation?.technician,
                installationAddress: installation?.installationAddress || clientUser.address,
                installationNotes: installation?.notes,
                installationCost: installation?.cost || internetPlan.price.installation
            },
            connection: {
                ipAddress: connection?.ipAddress,
                connectionType: connection?.connectionType || internetPlan.connectionType,
                ...connection
            },
            contract: {
                startDate: contract?.startDate || new Date(),
                duration: contract?.duration || internetPlan.contractDuration,
                autoRenewal: contract?.autoRenewal !== undefined ? contract.autoRenewal : true,
                ...contract
            },
            billing: {
                monthlyFee: billing?.monthlyFee || internetPlan.price.monthly,
                billingCycle: billing?.billingCycle || clientUser.billingInfo?.billingCycle || 'monthly',
                billingDay: billing?.billingDay || clientUser.billingInfo?.billingDay || 1,
                ...billing
            },
            createdBy: req.user.id
        };
        
        // Calcular fecha de finalización del contrato
        if (serviceData.contract.duration) {
            const endDate = new Date(serviceData.contract.startDate);
            endDate.setMonth(endDate.getMonth() + serviceData.contract.duration);
            serviceData.contract.endDate = endDate;
        }
        
        const service = new InternetService(serviceData);
        await service.save();
        
        // Actualizar referencias en el usuario
        await User.findByIdAndUpdate(
            client,
            { 
                $push: { 
                    services: {
                        service: service._id,
                        plan: internetPlan.name,
                        startDate: serviceData.contract.startDate,
                        isActive: true
                    }
                } 
            }
        );
        
        // Poblar datos para respuesta
        await service.populate([
            { path: 'client', select: 'name email clientInfo.customerCode' },
            { path: 'plan', select: 'name speed price' },
            { path: 'installation.technician', select: 'name employeeInfo.employeeId' }
        ]);
        
        res.status(201).json({
            success: true,
            msg: 'Servicio creado exitosamente',
            service
        });
        
    } catch (error) {
        console.error('Error creando servicio:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({ 
                msg: 'Ya existe un servicio con esos datos únicos' 
            });
        }
        
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Actualizar servicio
exports.updateService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const serviceId = req.params.id;
        const updates = req.body;
        
        // Solo admin, supervisor, billing y técnicos pueden actualizar
        if (!['admin', 'supervisor', 'billing', 'technician'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findById(serviceId);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        // Campos que se pueden actualizar según rol
        const allowedUpdates = [];
        if (['admin', 'supervisor'].includes(req.user.role)) {
            allowedUpdates.push(
                'plan', 'status', 'connection', 'contract', 'billing', 
                'installation', 'discounts', 'monitoring'
            );
        } else if (req.user.role === 'billing') {
            allowedUpdates.push('billing', 'discounts', 'contract');
        } else if (req.user.role === 'technician') {
            allowedUpdates.push('installation', 'connection', 'monitoring');
        }
        
        // Filtrar actualizaciones permitidas
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });
        
        filteredUpdates.updatedBy = req.user.id;
        
        const updatedService = await InternetService.findByIdAndUpdate(
            serviceId,
            { $set: filteredUpdates },
            { new: true, runValidators: true }
        ).populate([
            { path: 'client', select: 'name email clientInfo.customerCode' },
            { path: 'plan', select: 'name speed price' }
        ]);
        
        res.json({
            success: true,
            msg: 'Servicio actualizado exitosamente',
            service: updatedService
        });
        
    } catch (error) {
        console.error('Error actualizando servicio:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Cambiar plan del servicio
exports.changePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPlanId, reason, effectiveDate } = req.body;
        
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findById(id);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        const newPlan = await InternetPlan.findById(newPlanId);
        if (!newPlan || !newPlan.isActive) {
            return res.status(400).json({ msg: 'Nuevo plan no válido' });
        }
        
        // Usar el método del modelo
        await service.changePlan(newPlanId, req.user.id, reason, effectiveDate);
        
        // Actualizar tarifa mensual
        service.billing.monthlyFee = newPlan.price.monthly;
        await service.save();
        
        await service.populate([
            { path: 'plan', select: 'name speed price' },
            { path: 'client', select: 'name clientInfo.customerCode' }
        ]);
        
        res.json({
            success: true,
            msg: 'Plan cambiado exitosamente',
            service
        });
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Suspender servicio
exports.suspendService = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, notes } = req.body;
        
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findById(id);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        if (service.status === 'suspended') {
            return res.status(400).json({ msg: 'El servicio ya está suspendido' });
        }
        
        // Usar método del modelo
        await service.suspend(reason, req.user.id, notes);
        
        res.json({
            success: true,
            msg: 'Servicio suspendido exitosamente',
            service: {
                id: service._id,
                serviceCode: service.serviceCode,
                status: service.status
            }
        });
        
    } catch (error) {
        console.error('Error suspendiendo servicio:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Reactivar servicio
exports.reactivateService = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        
        if (!['admin', 'supervisor', 'billing'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findById(id);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        if (service.status !== 'suspended') {
            return res.status(400).json({ msg: 'El servicio no está suspendido' });
        }
        
        // Usar método del modelo
        await service.reactivate(req.user.id, notes);
        
        res.json({
            success: true,
            msg: 'Servicio reactivado exitosamente',
            service: {
                id: service._id,
                serviceCode: service.serviceCode,
                status: service.status
            }
        });
        
    } catch (error) {
        console.error('Error reactivando servicio:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener estadísticas de servicios
exports.getServiceStats = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'billing', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const stats = await InternetService.aggregate([
            {
                $group: {
                    _id: null,
                    totalServices: { $sum: 1 },
                    activeServices: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    suspendedServices: {
                        $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
                    },
                    pendingInstallation: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending_installation'] }, 1, 0] }
                    },
                    totalMonthlyRevenue: { $sum: '$billing.monthlyFee' },
                    averageMonthlyFee: { $avg: '$billing.monthlyFee' }
                }
            }
        ]);
        
        const statusBreakdown = await InternetService.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    revenue: { $sum: '$billing.monthlyFee' }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        const planBreakdown = await InternetService.aggregate([
            {
                $lookup: {
                    from: 'internetplans',
                    localField: 'plan',
                    foreignField: '_id',
                    as: 'planInfo'
                }
            },
            {
                $group: {
                    _id: '$planInfo.name',
                    count: { $sum: 1 },
                    revenue: { $sum: '$billing.monthlyFee' }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            stats: stats[0] || {
                totalServices: 0,
                activeServices: 0,
                suspendedServices: 0,
                pendingInstallation: 0,
                totalMonthlyRevenue: 0,
                averageMonthlyFee: 0
            },
            statusBreakdown,
            planBreakdown
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Servicios pendientes de instalación
exports.getPendingInstallations = async (req, res) => {
    try {
        if (!['admin', 'technician', 'supervisor', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const pendingServices = await InternetService.find({
            status: 'pending_installation'
        })
        .populate('client', 'name phone email clientInfo.customerCode address')
        .populate('plan', 'name speed')
        .populate('installation.technician', 'name phone employeeInfo.employeeId')
        .sort({ 'installation.scheduledDate': 1 });
        
        res.json({
            success: true,
            pendingInstallations: pendingServices,
            count: pendingServices.length
        });
        
    } catch (error) {
        console.error('Error obteniendo instalaciones pendientes:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Completar instalación
exports.completeInstallation = async (req, res) => {
    try {
        const { id } = req.params;
        const { equipmentInstalled, ipAddress, notes, photos, clientSignature } = req.body;
        
        if (!['admin', 'technician', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findById(id);
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        if (service.status !== 'pending_installation') {
            return res.status(400).json({ 
                msg: 'El servicio no está pendiente de instalación' 
            });
        }
        
        // Actualizar información de instalación
        service.installation.completedDate = new Date();
        service.installation.equipmentInstalled = equipmentInstalled;
        service.installation.installationNotes = notes;
        service.installation.installationPhotos = photos;
        service.installation.clientSignature = clientSignature;
        
        // Actualizar conexión
        if (ipAddress) {
            service.connection.ipAddress = ipAddress;
        }
        
        // Cambiar estado a activo
        service.status = 'active';
        
        await service.save();
        
        res.json({
            success: true,
            msg: 'Instalación completada exitosamente',
            service: {
                id: service._id,
                serviceCode: service.serviceCode,
                status: service.status,
                completedDate: service.installation.completedDate
            }
        });
        
    } catch (error) {
        console.error('Error completando instalación:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};
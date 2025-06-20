const { validationResult } = require('express-validator');
const Camera = require('../models/Camera');
const User = require('../models/User');

// Obtener cámaras del usuario o todas (admin/técnico)
exports.getCameras = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status, 
            manufacturer,
            location,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Construir filtros según el rol
        let filters = {};
        
        if (req.user.role === 'client') {
            // Clientes solo ven sus cámaras
            filters.owner = req.user.id;
        } else if (['technician', 'operator'].includes(req.user.role)) {
            // Técnicos pueden ver cámaras asignadas o todas si no hay filtro de owner
            if (req.query.owner) {
                filters.owner = req.query.owner;
            }
        }
        // Admin y supervisores ven todas sin restricción
        
        // Aplicar filtros adicionales
        if (status) filters.status = status;
        if (manufacturer) filters.manufacturer = manufacturer;
        if (location) filters.location = { $regex: location, $options: 'i' };
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: 'i' } },
                { model: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Opciones de paginación
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
        };
        
        const cameras = await Camera.find(filters)
            .populate('owner', 'name email clientInfo.customerCode')
            .sort(options.sort)
            .limit(options.limit * 1)
            .skip((options.page - 1) * options.limit);
            
        const total = await Camera.countDocuments(filters);
        
        res.json({
            success: true,
            cameras,
            pagination: {
                currentPage: options.page,
                totalPages: Math.ceil(total / options.limit),
                totalCameras: total,
                hasNext: options.page < Math.ceil(total / options.limit),
                hasPrev: options.page > 1
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo cámaras:', error);
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Obtener una cámara específica
exports.getCamera = async (req, res) => {
    try {
        const cameraId = req.params.id;
        
        const camera = await Camera.findById(cameraId)
            .populate('owner', 'name email phone clientInfo.customerCode address');
        
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar permisos
        if (req.user.role === 'client' && camera.owner._id.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'No autorizado para ver esta cámara' });
        }
        
        res.json({
            success: true,
            camera
        });
        
    } catch (error) {
        console.error('Error obteniendo cámara:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Agregar nueva cámara
exports.addCamera = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const { 
            name, 
            ipAddress, 
            port, 
            username, 
            password, 
            model, 
            manufacturer,
            location,
            coordinates,
            recordingEnabled,
            motionDetection,
            nightVision,
            resolution,
            storageLocation,
            monthlyFee,
            installationDate,
            warrantyExpiry,
            notes,
            owner 
        } = req.body;
        
        // Determinar el propietario
        let cameraOwner = req.user.id;
        if (owner && ['admin', 'technician', 'supervisor'].includes(req.user.role)) {
            cameraOwner = owner;
        }
        
        // Verificar que el propietario existe y es cliente
        const ownerUser = await User.findById(cameraOwner);
        if (!ownerUser) {
            return res.status(400).json({ msg: 'Propietario no encontrado' });
        }
        
        if (ownerUser.role !== 'client') {
            return res.status(400).json({ msg: 'Solo los clientes pueden tener cámaras' });
        }
        
        // Verificar IP única (opcional, dependiendo de tu red)
        const existingCamera = await Camera.findOne({ ipAddress });
        if (existingCamera) {
            return res.status(400).json({ 
                msg: 'Ya existe una cámara con esa dirección IP' 
            });
        }
        
        // Crear nueva cámara
        const cameraData = {
            name: name.trim(),
            owner: cameraOwner,
            ipAddress,
            port,
            username: username?.trim(),
            password,
            model: model?.trim(),
            manufacturer,
            location: location?.trim(),
            coordinates,
            recordingEnabled: recordingEnabled || false,
            motionDetection: motionDetection || false,
            nightVision: nightVision || false,
            resolution,
            storageLocation: storageLocation || 'local',
            monthlyFee: monthlyFee || 0,
            installationDate: installationDate || new Date(),
            warrantyExpiry,
            notes: notes?.trim(),
            status: 'offline' // Nueva cámara empieza offline hasta conexión
        };
        
        const camera = new Camera(cameraData);
        await camera.save();
        
        // Actualizar referencias en el usuario
        await User.findByIdAndUpdate(
            cameraOwner,
            { $push: { cameras: camera._id } }
        );
        
        // Poblar datos del propietario para respuesta
        await camera.populate('owner', 'name email clientInfo.customerCode');
        
        res.status(201).json({
            success: true,
            msg: 'Cámara agregada exitosamente',
            camera
        });
        
    } catch (error) {
        console.error('Error agregando cámara:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({ 
                msg: 'Ya existe una cámara con esos datos únicos' 
            });
        }
        
        res.status(500).json({ 
            msg: 'Error del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Actualizar cámara
exports.updateCamera = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                msg: 'Datos de entrada inválidos',
                errors: errors.array() 
            });
        }

        const cameraId = req.params.id;
        const updates = req.body;
        
        const camera = await Camera.findById(cameraId);
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar permisos
        if (req.user.role === 'client' && camera.owner.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'No autorizado para modificar esta cámara' });
        }
        
        // Campos que se pueden actualizar
        const allowedUpdates = [
            'name', 'ipAddress', 'port', 'username', 'password', 
            'model', 'manufacturer', 'location', 'coordinates',
            'recordingEnabled', 'motionDetection', 'nightVision',
            'resolution', 'storageLocation', 'monthlyFee',
            'warrantyExpiry', 'notes', 'isActive'
        ];
        
        // Solo admin/técnicos pueden actualizar ciertos campos
        if (['admin', 'technician', 'supervisor'].includes(req.user.role)) {
            allowedUpdates.push('status', 'installationDate', 'lastConnection');
        }
        
        // Filtrar actualizaciones permitidas
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });
        
        // Actualizar streamUrl si cambió la configuración de conexión
        if (filteredUpdates.ipAddress || filteredUpdates.port || 
            filteredUpdates.username || filteredUpdates.password) {
            
            const newIp = filteredUpdates.ipAddress || camera.ipAddress;
            const newPort = filteredUpdates.port || camera.port;
            const newUsername = filteredUpdates.username || camera.username;
            const newPassword = filteredUpdates.password || camera.password;
            
            filteredUpdates.streamUrl = camera.getFullStreamUrl.call({
                ipAddress: newIp,
                port: newPort,
                username: newUsername,
                password: newPassword,
                streamUrl: camera.streamUrl
            });
        }
        
        const updatedCamera = await Camera.findByIdAndUpdate(
            cameraId,
            { $set: filteredUpdates },
            { new: true, runValidators: true }
        ).populate('owner', 'name email clientInfo.customerCode');
        
        res.json({
            success: true,
            msg: 'Cámara actualizada exitosamente',
            camera: updatedCamera
        });
        
    } catch (error) {
        console.error('Error actualizando cámara:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Eliminar cámara
exports.deleteCamera = async (req, res) => {
    try {
        const cameraId = req.params.id;
        
        const camera = await Camera.findById(cameraId);
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar permisos (solo admin puede eliminar)
        if (!['admin', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ 
                msg: 'Solo administradores pueden eliminar cámaras' 
            });
        }
        
        // Eliminar referencia del usuario
        await User.findByIdAndUpdate(
            camera.owner,
            { $pull: { cameras: cameraId } }
        );
        
        // Eliminar cámara
        await Camera.findByIdAndDelete(cameraId);
        
        res.json({
            success: true,
            msg: 'Cámara eliminada exitosamente'
        });
        
    } catch (error) {
        console.error('Error eliminando cámara:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Cambiar estado de cámara (online/offline/maintenance)
exports.updateCameraStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        // Solo técnicos y admin pueden cambiar estado
        if (!['admin', 'technician', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'No autorizado para cambiar estado' });
        }
        
        const validStatuses = ['online', 'offline', 'error', 'maintenance'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                msg: 'Estado inválido. Use: ' + validStatuses.join(', ') 
            });
        }
        
        const camera = await Camera.findById(id);
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        camera.status = status;
        camera.lastConnection = status === 'online' ? new Date() : camera.lastConnection;
        
        if (notes) {
            camera.notes = camera.notes ? `${camera.notes}\n${new Date().toISOString()}: ${notes}` : notes;
        }
        
        await camera.save();
        
        res.json({
            success: true,
            msg: `Estado de cámara actualizado a ${status}`,
            camera: {
                id: camera._id,
                name: camera.name,
                status: camera.status,
                lastConnection: camera.lastConnection
            }
        });
        
    } catch (error) {
        console.error('Error actualizando estado:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Obtener estadísticas de cámaras (admin/supervisor)
exports.getCameraStats = async (req, res) => {
    try {
        if (!['admin', 'supervisor', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const stats = await Camera.aggregate([
            {
                $group: {
                    _id: null,
                    totalCameras: { $sum: 1 },
                    onlineCameras: {
                        $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] }
                    },
                    offlineCameras: {
                        $sum: { $cond: [{ $eq: ['$status', 'offline'] }, 1, 0] }
                    },
                    errorCameras: {
                        $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] }
                    },
                    maintenanceCameras: {
                        $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] }
                    },
                    totalMonthlyRevenue: { $sum: '$monthlyFee' }
                }
            }
        ]);
        
        const manufacturerStats = await Camera.aggregate([
            {
                $group: {
                    _id: '$manufacturer',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        const resolutionStats = await Camera.aggregate([
            {
                $group: {
                    _id: '$resolution',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            stats: stats[0] || {
                totalCameras: 0,
                onlineCameras: 0,
                offlineCameras: 0,
                errorCameras: 0,
                maintenanceCameras: 0,
                totalMonthlyRevenue: 0
            },
            manufacturerBreakdown: manufacturerStats,
            resolutionBreakdown: resolutionStats
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Cámaras offline (para monitoreo)
exports.getOfflineCameras = async (req, res) => {
    try {
        if (!['admin', 'technician', 'supervisor', 'operator'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const offlineCameras = await Camera.find({
            $or: [
                { status: 'offline' },
                { status: 'error' },
                { 
                    status: 'online',
                    lastConnection: { 
                        $lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutos
                    }
                }
            ]
        })
        .populate('owner', 'name phone email clientInfo.customerCode address')
        .sort({ lastConnection: 1 });
        
        res.json({
            success: true,
            offlineCameras,
            count: offlineCameras.length
        });
        
    } catch (error) {
        console.error('Error obteniendo cámaras offline:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};

// Test de conectividad de cámara
exports.testCameraConnection = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!['admin', 'technician', 'supervisor'].includes(req.user.role)) {
            return res.status(403).json({ msg: 'No autorizado' });
        }
        
        const camera = await Camera.findById(id);
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Aquí implementarías la lógica real de prueba de conectividad
        // Por ejemplo, ping a la IP, prueba de RTSP, etc.
        
        const testResult = {
            ip: camera.ipAddress,
            port: camera.port,
            ping: Math.random() > 0.3, // Simulado
            rtspStream: Math.random() > 0.2, // Simulado
            testedAt: new Date()
        };
        
        // Actualizar estado basado en el test
        const newStatus = testResult.ping && testResult.rtspStream ? 'online' : 'error';
        camera.status = newStatus;
        camera.lastConnection = testResult.ping ? new Date() : camera.lastConnection;
        await camera.save();
        
        res.json({
            success: true,
            msg: 'Test de conectividad completado',
            testResult,
            newStatus
        });
        
    } catch (error) {
        console.error('Error en test de conectividad:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
};
const InternetService = require('../models/InternetService');

// Obtener todos los servicios (solo admin) o el servicio del usuario
exports.getServices = async (req, res) => {
    try {
        let services;
        
        if (req.user.role === 'admin') {
            services = await InternetService.find().populate('client', 'name email');
        } else {
            services = await InternetService.find({ client: req.user.id });
        }
        
        res.json(services);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener un servicio específico
exports.getService = async (req, res) => {
    try {
        const service = await InternetService.findById(req.params.id).populate('client', 'name email');
        
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        // Verificar que el servicio pertenezca al usuario o sea admin
        if (service.client._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        res.json(service);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Crear nuevo servicio (solo admin)
exports.createService = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { 
            client, 
            plan, 
            downloadSpeed, 
            uploadSpeed, 
            ipAddress, 
            installationDate, 
            nextBillingDate, 
            monthlyCost, 
            notes 
        } = req.body;
        
        const newService = new InternetService({
            client,
            plan,
            downloadSpeed,
            uploadSpeed,
            ipAddress,
            installationDate,
            nextBillingDate,
            monthlyCost,
            notes
        });
        
        const service = await newService.save();
        await service.populate('client', 'name email');
        
        res.json(service);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Actualizar servicio (solo admin)
exports.updateService = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const service = await InternetService.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        ).populate('client', 'name email');
        
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        res.json(service);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Suspender/Activar servicio (solo admin)
exports.toggleServiceStatus = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const { status } = req.body;
        
        const service = await InternetService.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        ).populate('client', 'name email');
        
        if (!service) {
            return res.status(404).json({ msg: 'Servicio no encontrado' });
        }
        
        res.json(service);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};
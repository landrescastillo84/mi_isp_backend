const Camera = require('../models/Camera');

// Obtener todas las cámaras del usuario
exports.getCameras = async (req, res) => {
    try {
        const cameras = await Camera.find({ owner: req.user.id });
        res.json(cameras);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener una cámara específica
exports.getCamera = async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id);
        
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar que la cámara pertenezca al usuario o sea admin
        if (camera.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        res.json(camera);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Agregar nueva cámara
exports.addCamera = async (req, res) => {
    try {
        const { name, ipAddress, port, username, password, model, location } = req.body;
        
        const newCamera = new Camera({
            name,
            ipAddress,
            port,
            username,
            password,
            model,
            location,
            owner: req.user.id,
            streamUrl: `rtsp://${username}:${password}@${ipAddress}:${port}/stream`
        });
        
        const camera = await newCamera.save();
        res.json(camera);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Actualizar cámara
exports.updateCamera = async (req, res) => {
    try {
        const { name, ipAddress, port, username, password, model, location, isActive } = req.body;
        
        let camera = await Camera.findById(req.params.id);
        
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar que la cámara pertenezca al usuario o sea admin
        if (camera.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        camera = await Camera.findByIdAndUpdate(
            req.params.id,
            { 
                name, 
                ipAddress, 
                port, 
                username, 
                password, 
                model, 
                location, 
                isActive,
                streamUrl: `rtsp://${username}:${password}@${ipAddress}:${port}/stream`
            },
            { new: true }
        );
        
        res.json(camera);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Eliminar cámara
exports.deleteCamera = async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id);
        
        if (!camera) {
            return res.status(404).json({ msg: 'Cámara no encontrada' });
        }
        
        // Verificar que la cámara pertenezca al usuario o sea admin
        if (camera.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'No autorizado' });
        }
        
        await Camera.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Cámara eliminada' });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};
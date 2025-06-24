const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Registrar usuario
exports.register = async (req, res) => {
    try {
        const { name, email, password, role, address, phone } = req.body;
        
        // Verificar si el usuario ya existe
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'El usuario ya existe' });
        }
        
        // Crear nuevo usuario
        user = new User({
            name,
            email,
            password,
            role: role || 'client',
            address,
            phone
        });
        
        await user.save();
        
        // Crear y retornar JWT
        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };
        
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                });
            }
        );
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Iniciar sesión
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Verificar si el usuario existe
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Credenciales inválidas' });
        }
        
        // Verificar contraseña
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Credenciales inválidas' });
        }
        
        // Crear y retornar JWT
        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };
        
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                });
            }
        );
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener usuario actual
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};

// Obtener todos los usuarios (solo admin)
exports.getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acceso denegado' });
        }
        
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error del servidor');
    }
};


const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth: authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// ============================
// RUTAS PÚBLICAS (sin token)
// ============================

// Test endpoint público
router.get('/test', (req, res) => {
    res.json({ 
        message: 'Endpoint de autenticación funcionando',
        timestamp: new Date().toISOString(),
        routes: {
            'GET /test': 'Test público',
            'POST /register': 'Crear cuenta',
            'POST /login': 'Iniciar sesión',
            'GET /usuario': 'Perfil (requiere token)'
        }
    });
});

// Registro básico
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                msg: 'Nombre, email y contraseña son obligatorios'
            });
        }

        // Verificar si existe
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                msg: 'El usuario ya existe'
            });
        }

        // Crear usuario
        const user = new User({ name, email, password });
        await user.save();

        res.status(201).json({
            success: true,
            msg: 'Usuario creado exitosamente',
            user: { id: user._id, name: user.name, email: user.email }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            msg: 'Error del servidor'
        });
    }
});

// Login básico
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                msg: 'Email y contraseña son obligatorios'
            });
        }

        // Buscar usuario
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                msg: 'Credenciales incorrectas'
            });
        }

        // Verificar password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                msg: 'Credenciales incorrectas'
            });
        }

        // Generar token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'secret_temporal',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            msg: 'Login exitoso',
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            msg: 'Error del servidor'
        });
    }
});

// ============================
// RUTAS PROTEGIDAS (con token)
// ============================

// Mantener tu ruta original intacta
router.get('/usuario', authMiddleware, (req, res) => {
    res.json({ mensaje: 'Ruta protegida', user: req.user });
});

module.exports = router;
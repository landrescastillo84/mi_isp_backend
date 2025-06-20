const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:62506',    // ← TU PUERTO REAL DE FLUTTER
        'http://localhost:57987',    // Por si cambia
        'http://localhost:3000',     // Otros puertos comunes
        'http://127.0.0.1:62506'     // Alternativa IP
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
}));
app.use(express.json({ extended: false, limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============================
// RUTAS - SOLO ARCHIVOS QUE EXISTEN
// ============================

// Lista de rutas que SÍ tienes
const routes = [
    { path: '/api/auth', file: './routes/auth' },
    { path: '/api/cameras', file: './routes/cameras' },
    { path: '/api/services', file: './routes/internetService' },
    { path: '/api/payments', file: './routes/payments' }
];

// Cargar cada ruta con manejo de errores
routes.forEach(route => {
    try {
        const routeModule = require(route.file);
        app.use(route.path, routeModule);
        console.log(`✅ ${route.path} cargado correctamente`);
    } catch (error) {
        console.log(`❌ Error cargando ${route.file}:`, error.message);
    }
});

// ============================
// RUTAS BÁSICAS
// ============================

// Ruta principal
app.get('/', (req, res) => {
    res.json({ 
        msg: 'API de MIISPAPP funcionando correctamente',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        routes: {
            auth: '/api/auth',
            cameras: '/api/cameras', 
            services: '/api/services',
            payments: '/api/payments'
        }
    });
});

// Error 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl
    });
});

// Error global
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({
        error: 'Error interno del servidor'
    });
});

const PORT = process.env.PORT || 4000;

// Conectar MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/miispapp')
.then(() => {
    console.log('✅ MongoDB conectado');
    
    app.listen(PORT, () => {
        console.log(`🚀 Servidor en puerto ${PORT}`);
        console.log(`🌐 http://localhost:${PORT}`);
    });
})
.catch(err => {
    console.log('❌ Error MongoDB:', err.message);
    process.exit(1);
});
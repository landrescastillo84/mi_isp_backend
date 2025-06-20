const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'El nombre de la cámara es obligatorio'],
        trim: true,
        maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'El propietario es obligatorio']
    },
    ipAddress: {
        type: String,
        required: [true, 'La dirección IP es obligatoria'],
        validate: {
            validator: function(v) {
                return /^(\d{1,3}\.){3}\d{1,3}$/.test(v);
            },
            message: 'Formato de IP inválido'
        }
    },
    port: {
        type: Number,
        required: [true, 'El puerto es obligatorio'],
        min: [1, 'El puerto debe ser mayor a 0'],
        max: [65535, 'El puerto debe ser menor a 65536']
    },
    username: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        // En producción, esto debería estar encriptado
    },
    model: {
        type: String,
        trim: true
    },
    manufacturer: {
        type: String,
        trim: true,
        enum: ['Hikvision', 'Dahua', 'Axis', 'Uniview', 'TP-Link', 'Otro']
    },
    location: {
        type: String,
        trim: true,
        maxlength: [200, 'La ubicación no puede exceder 200 caracteres']
    },
    coordinates: {
        lat: Number,
        lng: Number
    },
    isActive: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'error', 'maintenance'],
        default: 'offline'
    },
    lastConnection: {
        type: Date,
        default: Date.now
    },
    streamUrl: {
        type: String,
        trim: true
    },
    recordingEnabled: {
        type: Boolean,
        default: false
    },
    motionDetection: {
        type: Boolean,
        default: false
    },
    nightVision: {
        type: Boolean,
        default: false
    },
    resolution: {
        type: String,
        enum: ['720p', '1080p', '4K', '8MP', 'Otro']
    },
    storageLocation: {
        type: String,
        enum: ['local', 'cloud', 'nvr'],
        default: 'local'
    },
    monthlyFee: {
        type: Number,
        min: [0, 'La tarifa mensual no puede ser negativa'],
        default: 0
    },
    installationDate: {
        type: Date
    },
    warrantyExpiry: {
        type: Date
    },
    notes: {
        type: String,
        maxlength: [500, 'Las notas no pueden exceder 500 caracteres']
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Esto maneja automáticamente createdAt y updatedAt
});

// Índices para mejorar rendimiento
cameraSchema.index({ owner: 1 });
cameraSchema.index({ ipAddress: 1 });
cameraSchema.index({ isActive: 1 });
cameraSchema.index({ status: 1 });

// Middleware para actualizar updatedAt
cameraSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Método para verificar si la cámara está online
cameraSchema.methods.isOnline = function() {
    return this.status === 'online' && this.isActive;
};

// Método para obtener URL completa de stream
cameraSchema.methods.getFullStreamUrl = function() {
    if (this.streamUrl) return this.streamUrl;
    return `rtsp://${this.username}:${this.password}@${this.ipAddress}:${this.port}/stream1`;
};

module.exports = mongoose.model('Camera', cameraSchema);
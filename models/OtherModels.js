const mongoose = require('mongoose');

// 1. MODELO INTERNETPLAN - Planes de servicio
const internetPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true // "Básico 10MB", "Premium 50MB"
    },
    speed: {
        download: { type: Number, required: true }, // Mbps
        upload: { type: Number, required: true }
    },
    dataLimit: {
        type: Number, // GB por mes, 0 = ilimitado
        default: 0
    },
    price: {
        monthly: { type: Number, required: true },
        installation: { type: Number, default: 0 },
        equipment: { type: Number, default: 0 }
    },
    features: [String], // ["IP fija", "Soporte 24/7", "WiFi incluido"]
    customerType: {
        type: String,
        enum: ['residential', 'business', 'enterprise'],
        default: 'residential'
    },
    isActive: { type: Boolean, default: true },
    contractDuration: { type: Number, default: 12 }, // meses
    createdAt: { type: Date, default: Date.now }
});

// 2. MODELO INTERNETSERVICE - Servicios contratados por cliente
const internetServiceSchema = new mongoose.Schema({
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InternetPlan',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'suspended', 'cancelled', 'pending_installation'],
        default: 'pending_installation'
    },
    installation: {
        scheduledDate: Date,
        completedDate: Date,
        technician: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        equipmentInstalled: [String],
        notes: String
    },
    connection: {
        ipAddress: String,
        router: String,
        switchPort: String,
        connectionType: {
            type: String,
            enum: ['fiber', 'cable', 'wireless', 'dsl']
        }
    },
    contractStartDate: { type: Date, required: true },
    contractEndDate: Date,
    monthlyFee: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// 3. MODELO SUPPORTTICKET - Sistema de soporte técnico
const supportTicketSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        unique: true,
        required: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Técnico asignado
    },
    category: {
        type: String,
        enum: ['internet', 'camera', 'billing', 'equipment', 'installation', 'other'],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'waiting_client', 'resolved', 'closed'],
        default: 'open'
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    resolution: String,
    attachments: [String], // URLs de archivos
    comments: [{
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        message: String,
        isInternal: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }],
    slaTarget: Date, // Fecha límite según SLA
    resolvedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

// 4. MODELO NETWORKEQUIPMENT - Equipos de red
const networkEquipmentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['router', 'switch', 'access_point', 'modem', 'camera', 'nvr'],
        required: true
    },
    model: { type: String, required: true },
    manufacturer: String,
    serialNumber: { type: String, unique: true },
    macAddress: String,
    ipAddress: String,
    location: String,
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'damaged'],
        default: 'active'
    },
    purchaseDate: Date,
    warrantyExpiry: Date,
    lastMaintenance: Date,
    nextMaintenance: Date,
    createdAt: { type: Date, default: Date.now }
});

// 5. MODELO INVOICE - Facturas generadas
const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        unique: true,
        required: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    period: {
        start: { type: Date, required: true },
        end: { type: Date, required: true }
    },
    services: [{
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InternetService'
        },
        description: String,
        amount: Number
    }],
    cameras: [{
        camera: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Camera'
        },
        description: String,
        amount: Number
    }],
    subtotal: { type: Number, required: true },
    taxes: { type: Number, default: 0 },
    total: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: {
        type: String,
        enum: ['pending', 'sent', 'paid', 'overdue', 'cancelled'],
        default: 'pending'
    },
    paidAt: Date,
    payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    createdAt: { type: Date, default: Date.now }
});

// 6. MODELO NOTIFICATION - Sistema de notificaciones
const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['payment_reminder', 'service_issue', 'maintenance', 'promotion', 'system'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    channels: [{
        type: String,
        enum: ['email', 'sms', 'whatsapp', 'push'],
        required: true
    }],
    sentAt: Date,
    readAt: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    InternetPlan: mongoose.model('InternetPlan', internetPlanSchema),
    InternetService: mongoose.model('InternetService', internetServiceSchema),
    SupportTicket: mongoose.model('SupportTicket', supportTicketSchema),
    NetworkEquipment: mongoose.model('NetworkEquipment', networkEquipmentSchema),
    Invoice: mongoose.model('Invoice', invoiceSchema),
    Notification: mongoose.model('Notification', notificationSchema)
};
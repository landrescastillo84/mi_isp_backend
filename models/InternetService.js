const mongoose = require('mongoose');

const internetServiceSchema = new mongoose.Schema({
    // Cliente que contrató el servicio
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'El cliente es obligatorio']
    },
    
    // Plan de internet contratado
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InternetPlan',
        required: [true, 'El plan es obligatorio']
    },
    
    // Código único del servicio
    serviceCode: {
        type: String,
        unique: true,
        required: true
    },
    
    // Estado del servicio
    status: {
        type: String,
        enum: ['pending_installation', 'active', 'suspended', 'cancelled', 'pending_cancellation', 'maintenance'],
        default: 'pending_installation'
    },
    
    // Información de instalación
    installation: {
        scheduledDate: Date,
        completedDate: Date,
        technician: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            validate: {
                validator: async function(userId) {
                    if (!userId) return true;
                    const user = await mongoose.model('User').findById(userId);
                    return user && ['technician', 'admin', 'supervisor'].includes(user.role);
                },
                message: 'Solo se puede asignar a técnicos, administradores o supervisores'
            }
        },
        equipmentInstalled: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'NetworkEquipment'
        }],
        installationAddress: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            coordinates: {
                lat: Number,
                lng: Number
            },
            instructions: String // Instrucciones especiales para llegar
        },
        installationNotes: String,
        installationPhotos: [String], // URLs de fotos de la instalación
        clientSignature: String, // URL de la firma digital del cliente
        installationCost: {
            type: Number,
            default: 0,
            min: [0, 'El costo no puede ser negativo']
        }
    },
    
    // Información técnica de la conexión
    connection: {
        ipAddress: {
            type: String,
            validate: {
                validator: function(v) {
                    if (!v) return true;
                    return /^(\d{1,3}\.){3}\d{1,3}$/.test(v);
                },
                message: 'Formato de IP inválido'
            }
        },
        gateway: String,
        dns: {
            primary: String,
            secondary: String
        },
        subnet: String,
        vlan: String,
        router: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'NetworkEquipment'
        },
        switchPort: String,
        connectionType: {
            type: String,
            enum: ['fiber', 'cable', 'wireless', 'dsl', 'satellite'],
            default: 'fiber'
        },
        cableLength: Number, // metros
        signalStrength: Number, // dBm para conexiones wireless
        lastSpeedTest: {
            download: Number, // Mbps
            upload: Number, // Mbps
            ping: Number, // ms
            jitter: Number, // ms
            testedAt: Date,
            testedBy: String // 'system' o 'technician'
        }
    },
    
    // Información del contrato
    contract: {
        startDate: {
            type: Date,
            required: [true, 'La fecha de inicio es obligatoria']
        },
        endDate: Date,
        duration: {
            type: Number,
            default: 12, // meses
            min: [1, 'La duración mínima es 1 mes']
        },
        autoRenewal: {
            type: Boolean,
            default: true
        },
        cancellationNotice: {
            type: Number,
            default: 30 // días de aviso para cancelación
        },
        contractDocument: String // URL del contrato firmado
    },
    
    // Información de facturación específica del servicio
    billing: {
        monthlyFee: {
            type: Number,
            required: [true, 'La tarifa mensual es obligatoria'],
            min: [0, 'La tarifa no puede ser negativa']
        },
        billingCycle: {
            type: String,
            enum: ['monthly', 'quarterly', 'semi-annual', 'annual'],
            default: 'monthly'
        },
        billingDay: {
            type: Number,
            min: 1,
            max: 31,
            default: 1
        },
        prorationEnabled: {
            type: Boolean,
            default: true
        },
        lastBilledDate: Date,
        nextBillingDate: Date,
        outstandingBalance: {
            type: Number,
            default: 0
        }
    },
    
    // Descuentos y promociones aplicadas
    discounts: [{
        name: String,
        description: String,
        type: {
            type: String,
            enum: ['percentage', 'fixed_amount', 'free_months'],
            required: true
        },
        value: {
            type: Number,
            required: true
        },
        validFrom: Date,
        validUntil: Date,
        isActive: {
            type: Boolean,
            default: true
        },
        appliedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Historial de cambios de plan
    planChanges: [{
        fromPlan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InternetPlan'
        },
        toPlan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InternetPlan'
        },
        changeDate: {
            type: Date,
            default: Date.now
        },
        reason: String,
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        effectiveDate: Date,
        proratedAmount: Number
    }],
    
    // Suspensiones del servicio
    suspensions: [{
        reason: {
            type: String,
            enum: ['non_payment', 'technical_issues', 'client_request', 'maintenance', 'abuse', 'other'],
            required: true
        },
        suspendedAt: {
            type: Date,
            default: Date.now
        },
        suspendedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reactivatedAt: Date,
        reactivatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        notes: String,
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    
    // Monitoreo del servicio
    monitoring: {
        isMonitored: {
            type: Boolean,
            default: true
        },
        lastPing: Date,
        uptime: {
            type: Number,
            default: 100, // porcentaje
            min: 0,
            max: 100
        },
        downtimeThisMonth: {
            type: Number,
            default: 0 // minutos
        },
        lastDowntime: Date,
        alertsEnabled: {
            type: Boolean,
            default: true
        }
    },
    
    // Uso de datos (para planes con límite)
    dataUsage: {
        currentMonth: {
            download: {
                type: Number,
                default: 0 // GB
            },
            upload: {
                type: Number,
                default: 0 // GB
            },
            total: {
                type: Number,
                default: 0 // GB
            },
            lastUpdated: Date
        },
        history: [{
            month: String, // YYYY-MM
            download: Number,
            upload: Number,
            total: Number,
            overage: Number, // GB sobre el límite
            overageCharges: Number // cargos adicionales
        }],
        warningThreshold: {
            type: Number,
            default: 80 // porcentaje del límite
        },
        alertsSent: [{
            type: {
                type: String,
                enum: ['warning', 'limit_reached', 'overage']
            },
            sentAt: Date,
            threshold: Number
        }]
    },
    
    // Soporte y mantenimiento
    support: {
        preferredContactMethod: {
            type: String,
            enum: ['phone', 'email', 'whatsapp', 'sms'],
            default: 'phone'
        },
        slaLevel: {
            type: String,
            enum: ['basic', 'premium', 'enterprise'],
            default: 'basic'
        },
        maintenanceWindow: {
            dayOfWeek: {
                type: Number,
                min: 0,
                max: 6 // 0 = Domingo
            },
            startTime: String, // HH:MM
            endTime: String // HH:MM
        }
    },
    
    // Notas internas
    internalNotes: [{
        note: String,
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        isImportant: {
            type: Boolean,
            default: false
        }
    }],
    
    // Metadatos
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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
    timestamps: true
});

// Índices para mejorar rendimiento
internetServiceSchema.index({ client: 1 });
internetServiceSchema.index({ plan: 1 });
internetServiceSchema.index({ serviceCode: 1 });
internetServiceSchema.index({ status: 1 });
internetServiceSchema.index({ 'contract.startDate': 1 });
internetServiceSchema.index({ 'billing.nextBillingDate': 1 });
internetServiceSchema.index({ 'connection.ipAddress': 1 });

// Middleware para generar código de servicio automáticamente
internetServiceSchema.pre('save', async function(next) {
    if (this.isNew && !this.serviceCode) {
        const count = await mongoose.model('InternetService').countDocuments();
        this.serviceCode = `SRV${String(count + 1).padStart(8, '0')}`;
    }
    next();
});

// Middleware para calcular próxima fecha de facturación
internetServiceSchema.pre('save', function(next) {
    if (this.isModified('contract.startDate') || this.isModified('billing.billingCycle')) {
        const startDate = this.contract.startDate;
        const billingDay = this.billing.billingDay;
        
        // Calcular próxima fecha de facturación
        const nextBilling = new Date(startDate);
        nextBilling.setDate(billingDay);
        
        // Si la fecha ya pasó este mes, mover al próximo mes
        if (nextBilling <= startDate) {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        
        this.billing.nextBillingDate = nextBilling;
    }
    next();
});

// Método para verificar si el servicio está activo
internetServiceSchema.methods.isActive = function() {
    return this.status === 'active';
};

// Método para suspender servicio
internetServiceSchema.methods.suspend = function(reason, userId, notes = '') {
    this.status = 'suspended';
    this.suspensions.push({
        reason,
        suspendedBy: userId,
        notes
    });
    this.updatedBy = userId;
    return this.save();
};

// Método para reactivar servicio
internetServiceSchema.methods.reactivate = function(userId, notes = '') {
    this.status = 'active';
    
    // Marcar la suspensión activa como reactivada
    const activeSuspension = this.suspensions.find(s => s.isActive);
    if (activeSuspension) {
        activeSuspension.isActive = false;
        activeSuspension.reactivatedAt = new Date();
        activeSuspension.reactivatedBy = userId;
        if (notes) activeSuspension.notes += ` | Reactivación: ${notes}`;
    }
    
    this.updatedBy = userId;
    return this.save();
};

// Método para cambiar plan
internetServiceSchema.methods.changePlan = function(newPlanId, userId, reason = '', effectiveDate = new Date()) {
    this.planChanges.push({
        fromPlan: this.plan,
        toPlan: newPlanId,
        reason,
        approvedBy: userId,
        effectiveDate
    });
    
    this.plan = newPlanId;
    this.updatedBy = userId;
    return this.save();
};

// Método para agregar nota interna
internetServiceSchema.methods.addInternalNote = function(note, userId, isImportant = false) {
    this.internalNotes.push({
        note,
        addedBy: userId,
        isImportant
    });
    this.updatedBy = userId;
    return this.save();
};

// Método para actualizar uso de datos
internetServiceSchema.methods.updateDataUsage = function(downloadGB, uploadGB) {
    this.dataUsage.currentMonth.download += downloadGB;
    this.dataUsage.currentMonth.upload += uploadGB;
    this.dataUsage.currentMonth.total = this.dataUsage.currentMonth.download + this.dataUsage.currentMonth.upload;
    this.dataUsage.currentMonth.lastUpdated = new Date();
    return this.save();
};

// Método para verificar si excede el límite de datos
internetServiceSchema.methods.isOverDataLimit = async function() {
    const plan = await mongoose.model('InternetPlan').findById(this.plan);
    if (!plan || plan.dataLimit === 0) return false; // Sin límite
    
    return this.dataUsage.currentMonth.total > plan.dataLimit;
};

// Método para calcular costo del servicio actual
internetServiceSchema.methods.getCurrentMonthlyCost = async function() {
    let baseCost = this.billing.monthlyFee;
    
    // Aplicar descuentos activos
    const activeDiscounts = this.discounts.filter(discount => 
        discount.isActive && 
        new Date() >= discount.validFrom && 
        new Date() <= discount.validUntil
    );
    
    for (const discount of activeDiscounts) {
        if (discount.type === 'percentage') {
            baseCost *= (1 - discount.value / 100);
        } else if (discount.type === 'fixed_amount') {
            baseCost -= discount.value;
        }
    }
    
    return Math.max(0, baseCost);
};

module.exports = mongoose.model('InternetService', internetServiceSchema);
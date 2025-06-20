const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    // Información básica
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'El cliente es obligatorio']
    },
    
    // Número de recibo/factura
    receiptNumber: {
        type: String,
        unique: true,
        required: true
    },
    
    // Servicios incluidos en el pago (puede ser múltiples)
    services: [{
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InternetService',
            required: true
        },
        plan: String,
        amount: {
            type: Number,
            required: true,
            min: [0, 'El monto no puede ser negativo']
        },
        billingPeriod: {
            start: {
                type: Date,
                required: true
            },
            end: {
                type: Date,
                required: true
            }
        }
    }],
    
    // Conceptos adicionales
    additionalCharges: [{
        concept: {
            type: String,
            required: true
        },
        description: String,
        amount: {
            type: Number,
            required: true
        },
        type: {
            type: String,
            enum: ['installation', 'equipment', 'maintenance', 'penalty', 'reconnection', 'other'],
            default: 'other'
        }
    }],
    
    // Descuentos aplicados
    discounts: [{
        concept: {
            type: String,
            required: true
        },
        description: String,
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        type: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'fixed'
        },
        code: String // Código de descuento si aplica
    }],
    
    // Cálculos de totales
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    totalDiscounts: {
        type: Number,
        default: 0,
        min: 0
    },
    taxableAmount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Impuestos
    taxes: [{
        name: {
            type: String,
            required: true // IVA, IGV, etc.
        },
        rate: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    totalTaxes: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Total final
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Información de pago
    paymentDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'digital_wallet', 'crypto', 'other'],
        required: true
    },
    
    // Detalles del método de pago
    paymentDetails: {
        transactionId: String,
        bankName: String,
        accountNumber: String,
        checkNumber: String,
        cardLastFour: String,
        authorizationCode: String,
        gateway: String // PayPal, Stripe, etc.
    },
    
    // Estado del pago
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded', 'partial'],
        default: 'pending'
    },
    
    // Pagos parciales
    partialPayments: [{
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        date: {
            type: Date,
            default: Date.now
        },
        method: String,
        transactionId: String,
        notes: String
    }],
    
    // Información de mora
    latePayment: {
        isLate: {
            type: Boolean,
            default: false
        },
        daysLate: {
            type: Number,
            default: 0,
            min: 0
        },
        lateFeesApplied: {
            type: Number,
            default: 0,
            min: 0
        },
        lateFeesRate: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    
    // Documentos y recibos
    documents: {
        receipt: String, // URL del recibo
        invoice: String, // URL de la factura
        proofOfPayment: String, // Comprobante de pago
        digitalSignature: String // Firma digital
    },
    
    // Información de facturación
    billingAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: {
            type: String,
            default: 'Ecuador'
        }
    },
    
    // Moneda
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'EUR', 'PEN', 'COP', 'MXN']
    },
    
    // Tipo de comprobante
    documentType: {
        type: String,
        enum: ['receipt', 'invoice', 'ticket', 'electronic_invoice'],
        default: 'receipt'
    },
    
    // Información fiscal (para facturación electrónica)
    fiscalInfo: {
        taxId: String,
        customerTaxId: String,
        electronicSignature: String,
        fiscalPeriod: String,
        authorizationNumber: String
    },
    
    // Notas y observaciones
    notes: {
        internal: String, // Notas internas
        customer: String, // Notas para el cliente
        paymentTerms: String // Términos de pago
    },
    
    // Auditoría
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Información de reversión (si aplica)
    refund: {
        isRefunded: {
            type: Boolean,
            default: false
        },
        refundDate: Date,
        refundAmount: Number,
        refundReason: String,
        refundedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    
    // Timestamps
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
paymentSchema.index({ client: 1 });
paymentSchema.index({ receiptNumber: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentDate: 1 });
paymentSchema.index({ dueDate: 1 });
paymentSchema.index({ 'services.service': 1 });

// Middleware para generar número de recibo automáticamente
paymentSchema.pre('save', async function(next) {
    if (this.isNew && !this.receiptNumber) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Payment').countDocuments({
            createdAt: {
                $gte: new Date(year, 0, 1),
                $lt: new Date(year + 1, 0, 1)
            }
        });
        this.receiptNumber = `REC${year}${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

// Middleware para calcular totales automáticamente
paymentSchema.pre('save', function(next) {
    // Calcular subtotal de servicios
    const servicesTotal = this.services.reduce((sum, service) => sum + service.amount, 0);
    
    // Calcular total de cargos adicionales
    const additionalTotal = this.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
    
    // Calcular subtotal
    this.subtotal = servicesTotal + additionalTotal;
    
    // Calcular total de descuentos
    this.totalDiscounts = this.discounts.reduce((sum, discount) => sum + discount.amount, 0);
    
    // Calcular monto gravable
    this.taxableAmount = this.subtotal - this.totalDiscounts;
    
    // Calcular total de impuestos
    this.totalTaxes = this.taxes.reduce((sum, tax) => sum + tax.amount, 0);
    
    // Calcular total final
    this.totalAmount = this.taxableAmount + this.totalTaxes + (this.latePayment.lateFeesApplied || 0);
    
    // Verificar si es pago tardío
    if (this.dueDate < this.paymentDate) {
        this.latePayment.isLate = true;
        this.latePayment.daysLate = Math.ceil((this.paymentDate - this.dueDate) / (1000 * 60 * 60 * 24));
    }
    
    next();
});

// Método para agregar pago parcial
paymentSchema.methods.addPartialPayment = function(amount, method, transactionId, notes) {
    this.partialPayments.push({
        amount,
        method,
        transactionId,
        notes,
        date: new Date()
    });
    
    const totalPaid = this.partialPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    if (totalPaid >= this.totalAmount) {
        this.status = 'completed';
    } else {
        this.status = 'partial';
    }
    
    return this.save();
};

// Método para procesar reembolso
paymentSchema.methods.processRefund = function(amount, reason, refundedBy) {
    this.refund = {
        isRefunded: true,
        refundDate: new Date(),
        refundAmount: amount,
        refundReason: reason,
        refundedBy
    };
    this.status = 'refunded';
    return this.save();
};

// Método para verificar si está vencido
paymentSchema.methods.isOverdue = function() {
    return this.status === 'pending' && new Date() > this.dueDate;
};

// Método para calcular días de mora
paymentSchema.methods.getDaysOverdue = function() {
    if (!this.isOverdue()) return 0;
    return Math.ceil((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
};

module.exports = mongoose.model('Payment', paymentSchema);
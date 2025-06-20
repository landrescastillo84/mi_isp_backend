const mongoose = require('mongoose');

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
    items: [{
        description: String,
        quantity: { type: Number, default: 1 },
        unitPrice: Number,
        total: Number
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
    createdAt: { type: Date, default: Date.now }
});

// Generar número de factura automáticamente
invoiceSchema.pre('save', async function(next) {
    if (this.isNew && !this.invoiceNumber) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Invoice').countDocuments({
            createdAt: {
                $gte: new Date(year, 0, 1),
                $lt: new Date(year + 1, 0, 1)
            }
        });
        this.invoiceNumber = `INV${year}${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
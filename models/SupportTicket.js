const mongoose = require('mongoose');

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
        ref: 'User'
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
    createdAt: { type: Date, default: Date.now }
});

// Generar número de ticket automáticamente
supportTicketSchema.pre('save', async function(next) {
    if (this.isNew && !this.ticketNumber) {
        const count = await mongoose.model('SupportTicket').countDocuments();
        this.ticketNumber = `TK${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
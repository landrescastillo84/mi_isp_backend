const mongoose = require('mongoose');

const internetPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
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

module.exports = mongoose.model('InternetPlan', internetPlanSchema);
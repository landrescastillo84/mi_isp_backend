const mongoose = require('mongoose');

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
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NetworkEquipment', networkEquipmentSchema);
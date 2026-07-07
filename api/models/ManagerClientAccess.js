const mongoose = require('mongoose');

const managerClientAccessSchema = new mongoose.Schema({
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: String, required: true },
    role: { type: String, enum: ['owner', 'viewer'], required: true, default: 'viewer' },
    grantedAt: { type: Date, default: Date.now }
});

managerClientAccessSchema.index({ managerId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.models.ManagerClientAccess || mongoose.model('ManagerClientAccess', managerClientAccessSchema);

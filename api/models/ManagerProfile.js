const mongoose = require('mongoose');

const managerProfileSchema = mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        clientId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        businessName: {
            type: String,
            required: true,
        },
        onboarding: {
            tone: String,
            services: [String],
            targetAudience: String,
            businessRules: mongoose.Schema.Types.Mixed,
            examples: [String],
            rawAssistantJson: mongoose.Schema.Types.Mixed,
        },
        syncStatus: {
            lastSyncOk: {
                type: Boolean,
                default: false,
            },
            lastSyncAt: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('ManagerProfile', managerProfileSchema);

const mongoose = require('mongoose');

const AppliedJobSchema = new mongoose.Schema({
    jobTitle: { 
        type: String, 
        required: true 
    },
    companyName: { 
        type: String, 
        required: true 
    },
    location: { 
        type: String 
    },
    platform: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        default: 'Applied',
        enum: ['Applied', 'Interviewing', 'Rejected', 'Offer']
    },
    appliedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Compound index to prevent creating duplicate application records for the exact same job
AppliedJobSchema.index({ jobTitle: 1, companyName: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('AppliedJob', AppliedJobSchema);

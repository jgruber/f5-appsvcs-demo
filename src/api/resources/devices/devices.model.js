import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate';

const REQUESTED = 'REQUESTED';

const {
    Schema
} = mongoose
const devicesSchema = new Schema({
    targetHost: {
        type: String,
        default: 'localhost',
        required: true
    },
    targetPort: {
        type: Number,
        default: 443,
        required: true
    },
    isBigIP: {
        type: Boolean,
        default: true,
        required: true
    },
    state: {
        type: String,
        required: true,
        default: REQUESTED
    }
});
devicesSchema.plugin(mongoosePaginate);

devicesSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

devicesSchema.set('toObject', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

export default mongoose.model('Device', devicesSchema);
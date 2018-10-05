import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate';

const {
    Schema
} = mongoose
const extensionsSchema = new Schema({
    url: {
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        unique: true,
        required: false
    },
    version: {
        type: String,
        required: false
    },
    release: {
        type: String,
        required: false
    },
    filename: {
        type: String,
        unique: true,
        required: false
    },
    status: {
        type: String,
        required: false,
        default: 'REQUESTED'
    }
});
extensionsSchema.plugin(mongoosePaginate);

extensionsSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
    }
});

extensionsSchema.set('toObject', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
})

export default mongoose.model('Extension', extensionsSchema);
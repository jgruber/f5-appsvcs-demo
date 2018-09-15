import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate';

const {
    Schema
} = mongoose
const deploymentsSchema = new Schema({
    name: {
        type: String,
        unique: true,
        required: true
    },
    deviceIds: [String]
});
deploymentsSchema.plugin(mongoosePaginate);

deploymentsSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
    }
});

deploymentsSchema.set('toObject', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
})

export default mongoose.model('Deployment', deploymentsSchema);
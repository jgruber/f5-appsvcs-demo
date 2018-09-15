import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate';
import bcrypt from 'bcrypt-nodejs';

const {
    Schema
} = mongoose
const usersSchema = new Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    roles: [String]
});
usersSchema.plugin(mongoosePaginate);

usersSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
    }
});

usersSchema.set('toObject', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
})

usersSchema.path('password').validate(function (v) {
    return validatePassword(v);
})

usersSchema.pre('save', function (cb) {
    var user = this;
    if (!user.isModified('password')) return cb();
    bcrypt.genSalt(5, function (err, salt) {
        if (err) return cb(err);
        bcrypt.hash(user.password, salt, null, function (err, hash) {
            if (err) return callback(err);
            user.password = hash;
            cb();
        });
    });
})

const validatePassword = (v) => {
    if (v.length < 8) return false;
    if ((/[a-z]/.test(v)) &&
        (/[A-Z]/.test(v)) &&
        (/[0-9]/.test(v)) &&
        (/[!&#$*@\(\):]/.test(v))
    ) {
        return true;
    }
    return false;
}

usersSchema.methods.verifyPassword = function (password, cb) {
    const user = this;
    bcrypt.compare(password, this.password, function (err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

export default mongoose.model('User', usersSchema);
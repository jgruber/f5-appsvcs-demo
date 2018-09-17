import mongoose, { mongo } from 'mongoose';

mongoose.Promise = global.Promise;
mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

const mongodb_url = process.env['MONGODB_URL'] || "mongodb://mongodb:27017/f5_appsvcs_demo";

export const connect = () => mongoose.connect(mongodb_url, { useNewUrlParser: true });

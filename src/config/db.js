import mongoose, { mongo } from 'mongoose';

mongoose.Promise = global.Promise;
mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

const connectOptions = {
    useNewUrlParser: true,
    auto_reconnect: true
};

const mongodb_url = process.env['MONGODB_URL'] || "mongodb://localhost:27017/f5_appsvcs_demo";

let isConnectedBefore = false;

// silently discard mongodb connection error.. 
mongoose.connection.on('error', function() {
    // Just let retry work.
});

// retry connection if previously connected.. 
// otherwise autreconnect works in connect options    
mongoose.connection.on('disconnected', function(){
    if (!isConnectedBefore)
        connect();
});

mongoose.connection.on('connected', function() {
    isConnectedBefore = true;
    console.log('connection established to MongoDB');
});

mongoose.connection.on('reconnected', function() {
    console.log('reconnected to MongoDB');
});

// Close the Mongoose connection, when receiving SIGINT
process.on('SIGINT', function() {
    mongoose.connection.close(function () {
        console.log('forced to close the MongoDB conection');
        process.exit(0);
    });
});

export const connect = () => mongoose.connect(mongodb_url, connectOptions);


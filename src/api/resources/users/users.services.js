import User from './users.model';

// we re-implemnted our basic auth strategy to fix issues and customize
import BasicStrategy from './passport.http';

const passport = require('passport')

passport.use(new BasicStrategy(
    function(username, password, cb) {
        User.findOne( { username: username }, function(err, user){
            if (err) { 
                console.log('username: ' + username + ' not found.')
                return cb(err); 
            }
            if (!user) { return cb (null, false); }
            user.verifyPassword(password, function(err, isMatch) {
                if(err) { return cb(err); }
                if(!isMatch) { return cb(null, false); }
                return cb(null, user);
            })
        })
    } 
));

exports.isAuthenticated = passport.authenticate('basic', { session: false });

var mongoose = require("mongoose"),
	MONGODBURI = "mongodb://heroku_nt5vtnbx:47egirav8vfqp82ac3hg5i8qt9@ds053794.mlab.com:53794/heroku_nt5vtnbx";
mongoose.connect(MONGODBURI);

var Cue = mongoose.model('Cue', {
    id: String,
    title: String,
    user: {
    	name: String,
    }
});

var User = mongoose.model('User', {
	name: {
		type: String,
		unique: true,
	},
	vibes: {
		type: Number, default: 1000
	},
	flag: String,
	online: Boolean
});

module.exports = {
	Cue,
	User,
};


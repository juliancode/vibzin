var mongoose = require("mongoose"),
	MONGODBURI = "mongodb://heroku_nt5vtnbx:47egirav8vfqp82ac3hg5i8qt9@ds053794.mlab.com:53794/heroku_nt5vtnbx";
mongoose.connect(MONGODBURI);

var Cue = mongoose.model('Cue', {
    id: String,
    title: String,
    user: {
    	name: String,
    },
    vibes: {
    	type: Number, default: 0 
    },
    channel: String
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
	online: Boolean,
	channel: String
});

var Channel = mongoose.model('Channel', {
	id: {
		type: String,
		unique: true,
	},
	owner: String,
	description: {
		type: String,
		min: 0,
		max: 100
	},
	cue: [{
	    id: String,
	    title: String,
	    user: {
	    	name: String,
	    },
	    vibes: {
	    	type: Number, default: 0 
    	}
	}]
});

module.exports = {
	Cue,
	User,
	Channel
};


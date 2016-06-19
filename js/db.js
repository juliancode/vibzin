var mongoose = require("mongoose"),
	MONGODBURI = "mongodb://heroku_nt5vtnbx:47egirav8vfqp82ac3hg5i8qt9@ds053794.mlab.com:53794/heroku_nt5vtnbx";
mongoose.connect(MONGODBURI);

var Video = mongoose.model('Video', {
    id: String,
    title: String,
    user: String,
});

module.exports.Video = Video;


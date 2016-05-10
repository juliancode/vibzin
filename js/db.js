var mongoose = require("mongoose");
mongoose.connect('mongodb://localhost/playlist');

var Video = mongoose.model('Video', {
    id: String,
    user: String,
});

module.exports.Video = Video;


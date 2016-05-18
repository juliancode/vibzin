var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Video = require('./js/db').Video,
	users = {},
	cue = [],
	port = Number(process.env.PORT || 3000)

server.listen(port, function() {
	console.log("now listening on: " + port);
});

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index1.html');
});

io.on('connection', function(socket) {
	getCueFromDb();

	socket.on('new user', function(data, callback){
		if (data in users) {
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			users[socket.nickname] = socket;
			updateNicknames();
			socket.broadcast.emit('user join', {nick: socket.nickname});
		}
	});

	socket.on('disconnect', function(data) {
		if(!socket.nickname) return;
		delete users[socket.nickname];
		updateNicknames();
		socket.broadcast.emit('user leave', {nick: socket.nickname});
	});

	socket.on('new video', function(data, callback) {
		addToCue(data.id, socket.nickname, getCueFromDb)
			io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
	})

	socket.on('play next video', function(data) {
		removeVideo(cue[0], getCueFromDb(function() {
			io.sockets.emit('next video');
		}));	
	});

	socket.on('send message', function(data, callback){
		if (data === '!empty')
			dropDb();
		var msg = data.trim();
		io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
	});

	socket.on('pause video', function(data) {
		io.sockets.emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.emit('play video');
	});

});

function updateNicknames(){
	io.sockets.emit('usernames', Object.keys(users));
}

var getCueFromDb = function(callback) {
	Video.find({}).exec(function(err, videos) {
			if (err) {
				return err;
			}
			if (videos.length) {
				cue.length = 0 // empty array
				videos.forEach(function(video) {
					cue.push(video.id) // push all the videos from db into cue array
				});
				io.sockets.emit('send cue', {cue: cue});
				console.log("Get cue from db called", cue);
				if (callback)
					callback();
				else
					return
			}
			else {
				io.sockets.emit('send cue', {cue: cue});
				console.log("Get cue from db no videos left", cue)
			}
	})
}

var dropDb = function(callback) {
	Video.find({}).remove(function(err, data) {
		if (err)
			console.log(err)
		else 
			console.log(data)
		if (callback)
			callback();
		else
			return
	});
}

var removeVideo = function(id) {
	Video.find({'id' : id}).remove(function(err, data) {
		if (err)
			return (err)
		else {
		console.log("Removed video", id)
		cue.shift();
		return true
		}
	});
}

var addToCue = function(id, user, callback) {
	var video = new Video();
	video.id = id;
	video.user = user;
	video.save(function(err, data){
		if (err)
			console.log(err)
		else {
			console.log(data)
			if (callback) {
				callback();
			}
			else {
				console.log("No callback in addToCue")
				return
			}
		}
	});
}